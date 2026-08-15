import { useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';

import { TabBar } from '../components/TabBar';
import { DEFAULT_STATE } from '../store/useBloom';
import { TasksScreen } from './TasksScreen';
import '../styles.css';
import './DailyTarget.visual-fixture.css';

const NOW = new Date(2026, 7, 10, 12).getTime();
const TODAY = '2026-08-10';

function Fixture() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const night = params.get('theme') === 'night';
  const expandedSpacing = params.get('spacing') === 'expanded';
  const preference = params.get('preference');
  const fixtureState = params.get('state') ?? 'empty';
  const preferenceClass =
    preference === 'more'
      ? ' contrast-more-fixture'
      : preference === 'forced'
        ? ' forced-colors-fixture'
        : '';

  useEffect(() => {
    if (fixtureState !== 'focused') return;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('#new-task-name')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fixtureState]);

  const noOp = () => undefined;
  const bloom = {
    state: {
      ...DEFAULT_STATE,
      today: TODAY,
      now: NOW,
      tasks: [],
      activeTaskId: null,
      settings: {
        ...DEFAULT_STATE.settings,
        name: 'Mira',
      },
    },
    today: TODAY,
    now: NOW,
    palSprite: 'bunny',
    activeTask: undefined,
    actions: new Proxy({}, { get: () => noOp }),
  } as unknown as Parameters<typeof TasksScreen>[0]['bloom'];

  return (
    <div className="bezel">
      <div
        className={`phone mode-focus${night ? ' night' : ''}${expandedSpacing ? ' text-spacing-fixture' : ''}${preferenceClass}`}
      >
        <div className="sky-mood" aria-hidden="true">
          <div className="sky-layer sky-focus" />
        </div>
        <TasksScreen bloom={bloom} onOpenGuideArticle={noOp} />
        <TabBar active="tasks" onChange={noOp} showGoals={false} />
      </div>
    </div>
  );
}

const night = new URLSearchParams(window.location.search).get('theme') === 'night';
document.body.classList.toggle('night', night);
createRoot(document.getElementById('root')!).render(<Fixture />);
