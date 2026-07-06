import { useEffect, useState } from 'react';
import { TabBar, type ScreenName } from './components/TabBar';
import { NightSky } from './components/NightSky';
import { DaySky } from './components/DaySky';
import { Onboarding } from './components/Onboarding';
import { CompanionPrompt } from './components/CompanionPrompt';
import { FocusScreen } from './screens/FocusScreen';
import { TasksScreen } from './screens/TasksScreen';
import { CollectionScreen } from './screens/CollectionScreen';
import { useBloom } from './store/useBloom';
import { useCompanion } from './store/useCompanion';

export default function App() {
  const bloom = useBloom();
  const companion = useCompanion(bloom);
  const [screen, setScreen] = useState<ScreenName>('focus');

  const needsName = !bloom.state.settings.name.trim();
  const night = bloom.state.settings.night;
  const mode = bloom.state.mode;

  // Keep the page backdrop and the browser/status-bar chrome in sync with the theme.
  useEffect(() => {
    document.body.classList.toggle('night', night);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', night ? '#1b1535' : '#79bff2');
  }, [night]);

  return (
    <div className="bezel">
      <div className={`phone${night ? ' night' : ''} mode-${mode}`}>
        {/* Per-mode sky gradients; the active one crossfades in behind the
            animated sun/moon canvas. */}
        <div className="sky-mood" aria-hidden="true">
          <div className="sky-layer sky-focus" />
          <div className="sky-layer sky-short" />
          <div className="sky-layer sky-long" />
        </div>
        {night ? <NightSky /> : <DaySky />}
        {needsName ? (
          <Onboarding bloom={bloom} />
        ) : (
          <>
            {screen === 'focus' && <FocusScreen bloom={bloom} companion={companion} />}
            {screen === 'tasks' && <TasksScreen bloom={bloom} />}
            {screen === 'collection' && <CollectionScreen bloom={bloom} />}
            <TabBar active={screen} onChange={setScreen} />
            {/* The pet's check-in bubble floats over whichever screen is open. */}
            <CompanionPrompt
              companion={companion}
              palSprite={bloom.palSprite}
              focusLabel={companion.intention || bloom.activeTask?.t || null}
            />
          </>
        )}
      </div>
    </div>
  );
}
