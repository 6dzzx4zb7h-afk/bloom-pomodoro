import { useEffect, useMemo, useState } from 'react';
import { PixelPal } from '../components/PixelPal';
import { Dialog } from '../components/Dialog';
import type { useBloom } from '../store/useBloom';
import { GOAL_TARGET_MAX, dueLabel, goalPace, parseDue, type Goal } from '../store/goals';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface DeletedGoal {
  goal: Goal;
  index: number;
  linkedTaskIds: number[];
}

type GoalConfirmation =
  | { kind: 'shrink'; goal: Goal; target: number }
  | { kind: 'remove'; goal: Goal };

function shortDate(due: string): string {
  const d = parseDue(due);
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
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
  const [editId, setEditId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDue, setEditDue] = useState('');
  const [editTarget, setEditTarget] = useState('1');
  const [deletedGoal, setDeletedGoal] = useState<DeletedGoal | null>(null);
  const [confirmation, setConfirmation] = useState<GoalConfirmation | null>(null);
  const [addTouched, setAddTouched] = useState({ title: false, due: false });

  useEffect(() => {
    if (!deletedGoal) return;
    const timeout = window.setTimeout(() => setDeletedGoal(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [deletedGoal]);

  function beginEdit(goal: Goal) {
    setEditId(goal.id);
    setEditTitle(goal.title);
    setEditDue(goal.due);
    setEditTarget(String(goal.target));
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
    actions.updateGoal(goal.id, { title: editTitle, due: editDue, target: nextTarget });
    setEditId(null);
    setConfirmation(null);
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
    });
    actions.removeGoal(goal.id);
    setConfirmation(null);
  }

  function undoGoalDelete() {
    if (!deletedGoal) return;
    actions.restoreGoal(deletedGoal.goal, deletedGoal.index, deletedGoal.linkedTaskIds);
    setDeletedGoal(null);
  }

  const goals = useMemo(
    () => [...state.goals].sort((a, b) => a.due.localeCompare(b.due) || a.id - b.id),
    [state.goals],
  );

  const totals = goals.reduce(
    (acc, g) => ({
      done: acc.done + Math.min(g.done, g.target),
      target: acc.target + g.target,
    }),
    { done: 0, target: 0 },
  );
  const pct = totals.target ? Math.round((totals.done / totals.target) * 100) : 0;
  const allDone = goals.length > 0 && totals.done >= totals.target;
  const nextUp = goals.find((g) => goalPace(g, now).status === 'active');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !due) {
      setAddTouched({ title: true, due: true });
      return;
    }
    const t = Math.max(1, Math.min(GOAL_TARGET_MAX, parseInt(target, 10) || 1));
    actions.addGoal(title, due, t);
    // Keep date + size so a whole batch of entries goes in quickly.
    setTitle('');
    setAddTouched({ title: false, due: false });
  }

  return (
    <main className="screen tasks-bg" id="goals-screen" aria-labelledby="goals-heading">
      <div className="head">
        <h1 className="head-title" id="goals-heading">Goals &amp; deadlines</h1>
        <div className="head-sub">everything you're working toward · progress over pressure</div>
      </div>

      {goals.length > 0 && (
        <div className="prog-card">
          <div className="prog-tile">
            <PixelPal sprite={palSprite} mode={allDone ? 'celebrate' : 'idle'} scale={3} size={58} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="prog-count">
              {totals.done} of {totals.target} parts done
            </div>
            <div className="prog-sub">
              {allDone
                ? 'every goal is fully logged — lovely work ♡'
                : nextUp
                  ? `next up: ${nextUp.title} · ${dueLabel(nextUp, now)}`
                  : 'nothing pressing — breathe easy'}
            </div>
            <div className="prog-track">
              <div className="prog-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      )}

      <div className="task-list">
        {goals.map((goal) => {
          const pace = goalPace(goal, now);
          const gpct = Math.round((Math.min(goal.done, goal.target) / goal.target) * 100);
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
                    <span>Parts</span>
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
                <span className={`goal-chip ${pace.status}`}>{dueLabel(goal, now)}</span>
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
                  {goal.done}/{goal.target}
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

              <div className={`goal-pace ${pace.status}`}>
                {pace.status === 'done'
                  ? 'all parts logged — nicely done ♡'
                  : pace.status === 'overdue'
                    ? `the date slipped by — the ${goal.done} you finished still count`
                    : (pace.suggestion ??
                      `${pace.remaining} left · ${pace.daysLeft} day${pace.daysLeft === 1 ? '' : 's'} — do what you can, it all counts`)}
              </div>
            </div>
          );
        })}
        {goals.length === 0 && (
          <div className="task-empty">
            put anything you're working toward in — an exam, a project, a book to read, a habit
            to build — how many parts it has, and when you'd like it done. then just log parts as
            you finish them, and Bloom shows the gentle pace that gets you there ♡
          </div>
        )}
      </div>

      {deletedGoal && (
        <div className="undo-toast" role="status" aria-live="polite">
          <span>“{deletedGoal.goal.title}” removed</span>
          <button type="button" onClick={undoGoalDelete}>undo</button>
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
            <span>Parts</span>
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
        <div className="goal-hint">name · deadline · how many parts it splits into</div>
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
