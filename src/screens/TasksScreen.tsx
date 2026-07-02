import { useState } from 'react';
import { PixelPal } from '../components/PixelPal';
import { StatusBar } from '../components/StatusBar';
import type { useBloom } from '../store/useBloom';

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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    actions.addTask(draft, goal);
    setDraft('');
    setGoal(1);
  }

  return (
    <div className="screen tasks-bg">
      <div className="island" />
      <StatusBar />

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
