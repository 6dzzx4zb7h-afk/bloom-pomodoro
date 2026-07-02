import { useState } from 'react';
import { TabBar, type ScreenName } from './components/TabBar';
import { Onboarding } from './components/Onboarding';
import { FocusScreen } from './screens/FocusScreen';
import { TasksScreen } from './screens/TasksScreen';
import { CollectionScreen } from './screens/CollectionScreen';
import { useBloom } from './store/useBloom';

export default function App() {
  const bloom = useBloom();
  const [screen, setScreen] = useState<ScreenName>('focus');

  const needsName = !bloom.state.settings.name.trim();

  return (
    <div className="bezel">
      <div className="phone">
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
