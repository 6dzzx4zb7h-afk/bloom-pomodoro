import { useEffect, useState } from 'react';
import { TabBar, type ScreenName } from './components/TabBar';
import { NightSky } from './components/NightSky';
import { DaySky } from './components/DaySky';
import { Onboarding } from './components/Onboarding';
import { FocusScreen } from './screens/FocusScreen';
import { TasksScreen } from './screens/TasksScreen';
import { CollectionScreen } from './screens/CollectionScreen';
import { useBloom } from './store/useBloom';

export default function App() {
  const bloom = useBloom();
  const [screen, setScreen] = useState<ScreenName>('focus');

  const needsName = !bloom.state.settings.name.trim();
  const night = bloom.state.settings.night;

  // Keep the page backdrop and the browser/status-bar chrome in sync with the theme.
  useEffect(() => {
    document.body.classList.toggle('night', night);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', night ? '#1b1535' : '#79bff2');
  }, [night]);

  return (
    <div className="bezel">
      <div className={night ? 'phone night' : 'phone'}>
        {night ? <NightSky /> : <DaySky />}
        {needsName ? (
          <Onboarding bloom={bloom} />
        ) : (
          <>
            {screen === 'focus' && <FocusScreen bloom={bloom} />}
            {screen === 'tasks' && <TasksScreen bloom={bloom} />}
            {screen === 'collection' && <CollectionScreen bloom={bloom} />}
            <TabBar active={screen} onChange={setScreen} />
          </>
        )}
      </div>
    </div>
  );
}
