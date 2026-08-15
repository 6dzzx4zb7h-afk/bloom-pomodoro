import { useEffect, useRef, useState } from 'react';
import { TabBar, type ScreenName } from './components/TabBar';
import { NightSky } from './components/NightSky';
import { DaySky } from './components/DaySky';
import { Onboarding } from './components/Onboarding';
import { CompanionPrompt } from './components/CompanionPrompt';
import { StorageRecoveryNotice } from './components/StorageRecoveryNotice';
import { FocusScreen } from './screens/FocusScreen';
import { TasksScreen } from './screens/TasksScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { GoalsScreen } from './screens/GoalsScreen';
import { CollectionScreen } from './screens/CollectionScreen';
import { timerTransitionPolicy, useBloom } from './store/useBloom';
import { useCompanion } from './store/useCompanion';
import type { GuideArticleId } from './content/guide';
import { resolveFocusSurface } from './store/surfaceCoordinator';
import {
  configureNativeIOSTabs,
  isNativeIOSTabsPlatform,
  isNativeTabScreen,
  listenForNativeIOSTabSelection,
} from './native/iosTabs';
import { isNativeAppIconPlatform, selectNativeAppIcon } from './native/iosAppIcon';

export default function App() {
  const bloom = useBloom();
  const companion = useCompanion(bloom);
  const [screen, setScreen] = useState<ScreenName>('focus');
  const [guideArticleId, setGuideArticleId] = useState<GuideArticleId | null>(null);
  const [nativeTabsReady, setNativeTabsReady] = useState(false);
  const [focusOverlayOpen, setFocusOverlayOpen] = useState(false);
  const navigationRef = useRef<(next: ScreenName) => ScreenName>(() => 'focus');
  const nativeTabConfigurationRef = useRef({
    selected: screen,
    showGoals: false,
    night: false,
    visible: false,
  });

  const needsName = !bloom.state.settings.name.trim();
  const pal = bloom.state.settings.pal;
  const night = bloom.state.settings.night;
  const mode = bloom.state.mode;
  const showGoals = bloom.state.settings.planner;
  const hasPendingReturnTruth = Boolean(
    bloom.state.openFocus?.returnSnapshot?.returnedAt,
  );
  const appSurface = resolveFocusSurface({ returnTruth: hasPendingReturnTruth });
  const workSessionRunning =
    bloom.state.running &&
    (bloom.state.mode === 'focus' || bloom.state.mode === 'tiny' || bloom.state.mode === 'flow');
  const companionFocusLabel =
    bloom.state.openFocus?.targetText ||
    bloom.state.openFlow?.targetText ||
    bloom.activeTask?.t ||
    null;

  nativeTabConfigurationRef.current = {
    selected: screen,
    showGoals,
    night,
    visible: !needsName && !focusOverlayOpen,
  };

  const requestNavigation = (next: ScreenName) => {
    const decision = timerTransitionPolicy(bloom.state, 'navigation');
    const acceptedScreen =
      appSurface.blocksNavigation || decision.kind === 'confirm' ? 'focus' : next;
    setScreen(acceptedScreen);
    return acceptedScreen;
  };
  navigationRef.current = requestNavigation;

  const openGuideArticle = (id: GuideArticleId) => {
    // PLAN 6.3: contextual links wait for a natural pause. Manual browsing of
    // Collection remains available, but no contextual path interrupts work.
    if (workSessionRunning) return;
    setGuideArticleId(id);
    setScreen('collection');
  };

  // Keep the page backdrop and the browser/status-bar chrome in sync with the theme.
  useEffect(() => {
    document.body.classList.toggle('night', night);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', night ? '#1b1535' : '#79bff2');
  }, [night]);

  // If the planner is switched off while its screen is open, step back to Tasks.
  useEffect(() => {
    if (screen === 'goals' && !showGoals) setScreen('tasks');
  }, [screen, showGoals]);

  // A return question freezes the timer at its captured display until the
  // user answers. Bring its small re-entry card into view even if they left
  // Bloom while browsing another in-app screen (PLAN 5.2).
  useEffect(() => {
    if (appSurface.blocksNavigation) setScreen('focus');
  }, [appSurface.blocksNavigation]);

  // PLAN 13.2: iOS owns primary navigation through a real UITabBar. Its
  // selected lens/material/motion remain entirely system-rendered; React only
  // validates the destination and keeps the single web store authoritative.
  useEffect(() => {
    if (!isNativeIOSTabsPlatform()) return;

    let disposed = false;
    let listener: Awaited<ReturnType<typeof listenForNativeIOSTabSelection>> | null = null;

    void listenForNativeIOSTabSelection(({ screen: next }) => {
      if (!isNativeTabScreen(next)) return;

      const acceptedScreen = navigationRef.current(next);
      if (acceptedScreen !== next) {
        // UIKit highlights a tapped item before asking its delegate. Confirm
        // the reducer-authoritative destination so a navigation guard also
        // moves the system lens back to the screen that remains visible.
        void configureNativeIOSTabs({
          ...nativeTabConfigurationRef.current,
          selected: acceptedScreen,
        });
      }
    })
      .then((handle) => {
        if (disposed) void handle.remove();
        else listener = handle;
      })
      .catch(() => {
        if (!disposed) setNativeTabsReady(false);
      });

    return () => {
      disposed = true;
      if (listener) void listener.remove();
    };
  }, []);

  useEffect(() => {
    if (!isNativeIOSTabsPlatform()) return;

    let disposed = false;
    void configureNativeIOSTabs({
      selected: screen,
      showGoals,
      night,
      visible: !needsName && !focusOverlayOpen,
    })
      .then(({ active }) => {
        if (!disposed) setNativeTabsReady(active);
      })
      .catch(() => {
        // A stale native wrapper keeps the accessible web tab bar instead of
        // leaving the app without navigation.
        if (!disposed) setNativeTabsReady(false);
      });

    return () => {
      disposed = true;
    };
  }, [focusOverlayOpen, needsName, night, screen, showGoals]);

  // PLAN 13.9: the iOS home-screen icon shows whoever is on duty. The store
  // stays the authority; this only mirrors its choice onto the app icon.
  useEffect(() => {
    if (!isNativeAppIconPlatform()) return;

    let disposed = false;
    const reconcile = () => {
      if (disposed || document.visibilityState !== 'visible') return;
      void selectNativeAppIcon(pal);
    };

    reconcile();
    // iOS refuses an icon change while the app is in the background, so try
    // again the next time Bloom comes forward.
    document.addEventListener('visibilitychange', reconcile);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', reconcile);
    };
  }, [pal]);

  // Flow and Tiny Start share Focus's sky mood — both are working modes.
  const skyMode = mode === 'flow' || mode === 'tiny' ? 'focus' : mode;

  return (
    <div className="bezel">
      <div
        className={`phone${night ? ' night' : ''} mode-${skyMode}${nativeTabsReady ? ' native-ios-tabs' : ''}`}
      >
        <StorageRecoveryNotice
          recoveredBloom={bloom.storageRecovery.recoveredBloom}
          onRetry={bloom.storageRecovery.retry}
          onRecover={bloom.storageRecovery.recover}
        />
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
            {screen === 'focus' && (
              <FocusScreen
                bloom={bloom}
                companion={companion}
                onOpenGuideArticle={openGuideArticle}
                onOpenGoals={() => setScreen('goals')}
                onNativeOverlayChange={setFocusOverlayOpen}
              />
            )}
            {screen === 'tasks' && (
              <TasksScreen bloom={bloom} onOpenGuideArticle={openGuideArticle} />
            )}
            {screen === 'history' && (
              <HistoryScreen
                records={bloom.state.sessionRecords}
                archive={bloom.state.historyArchive}
                tasks={bloom.state.tasks}
                foundations={bloom.state.foundations}
                goalLedger={bloom.state.goalLedger}
                goals={bloom.state.goals}
                onRepair={bloom.actions.repairSession}
                dayStartHour={bloom.state.settings.dayStartHour}
                now={bloom.state.now}
              />
            )}
            {screen === 'goals' && showGoals && <GoalsScreen bloom={bloom} />}
            {screen === 'collection' && (
              <CollectionScreen
                bloom={bloom}
                guideArticleId={guideArticleId}
                onGuideArticleHandled={() => setGuideArticleId(null)}
              />
            )}
            {!nativeTabsReady && (
              <TabBar
                active={screen}
                onChange={requestNavigation}
                showGoals={showGoals}
              />
            )}
            {/* The pet's check-in bubble floats over whichever screen is open. */}
            {screen !== 'focus' && (
              <CompanionPrompt
                companion={companion}
                palSprite={bloom.palSprite}
                focusLabel={companionFocusLabel}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
