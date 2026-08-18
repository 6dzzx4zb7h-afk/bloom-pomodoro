import { useEffect, useMemo, useRef, useState } from 'react';
import { DebriefCard } from '../components/DebriefCard';
import { CompanionPrompt } from '../components/CompanionPrompt';
import { Dialog } from '../components/Dialog';
import { IfThenPlanner } from '../components/IfThenPlanner';
import { ParkingLot } from '../components/ParkingLot';
import { PixelPal } from '../components/PixelPal';
import { RitualCard, RitualSuggestion } from '../components/RitualCard';
import { ResumeCue } from '../components/ResumeCue';
import { SettingsSheet } from '../components/SettingsSheet';
import { WeeklyReview } from '../components/WeeklyReview';
import { WoopCard } from '../components/WoopCard';
import { shouldOfferWoop } from '../insights/triggers';
import { WEEKLY_WINDOW_DAYS, weekKeyForStudyDay } from '../insights/weekly';
import type { SessionRecord, TargetOutcome } from '../store/sessions';
import {
  SESSION_TARGET_MAX,
  TINY_EXTENSION_MIN,
  TINY_START_OPTIONS,
  flowCreditsForElapsed,
  isTinyFirstRung,
  persistedShapeFromState,
  timerTransitionPolicy,
  type TimerTransitionIntent,
  type TimerMode,
  type TinyStartMinutes,
  type useBloom,
} from '../store/useBloom';
import type { Companion } from '../store/useCompanion';
import { GuideSuggestion } from '../components/GuideSuggestion';
import { guideSuggestionFor } from '../insights/surfacing';
import { loadEvents } from '../store/companion';
import type { GuideArticleId } from '../content/guide';
import { groupSessionsByStudyDay } from '../store/sessionStats';
import { daysBetween } from '../store/streak';
import { FoundationsCard } from '../components/FoundationsCard';
import {
  isGoalDailyTarget,
  targetActual,
} from '../store/dailyTarget';
import { dayKeyFor } from '../store/dayKey';
import { goalPaceForStudyDay, goalUnit } from '../store/goals';
import { medianSessionCredit } from '../store/goalLedger';
import { sessionEffortLine } from '../insights/paceActual';
import {
  companionPromptForSurface,
  resolveFocusSurface,
} from '../store/surfaceCoordinator';
import {
  configureNativeIOSAuxiliaryControl,
  configureNativeIOSSegment,
  hideNativeIOSAuxiliaryControl,
  hideNativeIOSSegment,
  isNativeControlSlotVisible,
  isNativeIOSTabsPlatform,
  isNativeTimerMode,
  listenForNativeIOSAuxiliaryControlActivation,
  listenForNativeIOSSegmentSelection,
  observeNativeControlFrame,
  type NativeControlFrame,
} from '../native/iosTabs';

const RING_R = 92;
const RING_C = 2 * Math.PI * RING_R;
const MODE_LABEL: Record<TimerMode, string> = {
  focus: 'Focus',
  flow: 'Flow',
  tiny: 'Tiny',
  short: 'Short',
  long: 'Long',
};

export function FocusScreen({
  bloom,
  companion,
  onOpenGuideArticle,
  onOpenGoals,
  onNativeOverlayChange,
}: {
  bloom: ReturnType<typeof useBloom>;
  companion: Companion;
  onOpenGuideArticle: (id: GuideArticleId) => void;
  onOpenGoals?: () => void;
  onNativeOverlayChange?: (open: boolean) => void;
}) {
  const {
    state,
    now,
    mood,
    statusLabel,
    palSprite,
    activeTask,
    actions,
    completionAlerts,
    liveActivity,
    alarms,
    mmss,
    clock,
  } = bloom;
  const [showSettings, setShowSettings] = useState(false);
  const [tinyMinutes, setTinyMinutes] = useState<TinyStartMinutes>(TINY_START_OPTIONS[0]);
  const [ritualOpen, setRitualOpen] = useState(false);
  const [prepOpen, setPrepOpen] = useState(false);
  const [ritualSuggestionOpen, setRitualSuggestionOpen] = useState(false);
  const [woopOpen, setWoopOpen] = useState(false);
  const [targetDraft, setTargetDraft] = useState('');
  const [nativeModeReady, setNativeModeReady] = useState(false);
  const [nativeSettingsReady, setNativeSettingsReady] = useState(false);
  const [nativeSettingsFrame, setNativeSettingsFrame] = useState<NativeControlFrame | null>(null);
  // PLAN 13.10: the room UIKit reported it needs for the rail. The slot grows
  // to match so the system is never handed a frame that clips its own labels.
  const [nativeModeHeight, setNativeModeHeight] = useState(0);
  const [nativeWebOverlayOpen, setNativeWebOverlayOpen] = useState(false);
  const [parkingDeferred, setParkingDeferred] = useState(false);
  const [dayTargetIndex, setDayTargetIndex] = useState(0);
  const completionAlertLaterRef = useRef<HTMLButtonElement>(null);
  const [pendingTransition, setPendingTransition] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
  } | null>(null);
  const pendingTransitionAction = useRef<(() => void) | null>(null);
  const keepTransitionRef = useRef<HTMLButtonElement>(null);
  const nativeModeSlotRef = useRef<HTMLDivElement>(null);
  const nativeModeFrameRef = useRef<NativeControlFrame | null>(null);
  const nativeModeSelectionRef = useRef<(value: string) => void>(() => undefined);
  const nativeSettingsSlotRef = useRef<HTMLButtonElement>(null);
  const nativeSettingsActionRef = useRef<() => void>(() => undefined);

  // Post-session debrief (PLAN 2.1): watch the session log for a record
  // finalized while this screen is up. Seeding the ref with the log's current
  // tail means boot-time 'interrupted' sweeps never trigger a card — only a
  // session the user just ended (completed or abandoned) does.
  const records = state.sessionRecords;
  const [debrief, setDebrief] = useState<SessionRecord | null>(() =>
    [...records].reverse().find((record) => record.goalCredit === 'pending') ?? null,
  );
  const activeReturnSession = state.openFocus?.returnSnapshot?.returnedAt
    ? state.openFocus
    : null;
  const interruptedReturnSession = [...records]
    .reverse()
    .find((record) => record.outcome === 'interrupted' && record.resumeCuePending) ?? null;
  const resumeSession = activeReturnSession ?? interruptedReturnSession;
  const hasResumeCue = Boolean(resumeSession);
  const resumeParkedText = resumeSession
    ? [...state.parking]
        .reverse()
        .find((item) => item.sessionId === resumeSession.id)?.text
    : undefined;
  const returnedParking = state.parking.filter((item) => item.revealedAt !== null);
  const hasReturnedParking = returnedParking.length > 0;
  const hasBlockingReturnedParking = hasReturnedParking && !parkingDeferred;
  const lastSeenId = useRef<string | null>(
    records.length ? records[records.length - 1].id : null,
  );
  const recordAwaitingDebrief = (() => {
    const last = records.length ? records[records.length - 1] : null;
    return Boolean(
      last &&
        last.id !== lastSeenId.current &&
        (last.outcome === 'completed' || last.outcome === 'abandoned'),
    );
  })();
  useEffect(() => {
    const last = records.length ? records[records.length - 1] : null;
    if (!last || last.id === lastSeenId.current) return;
    lastSeenId.current = last.id;
    if (last.outcome === 'completed' || last.outcome === 'abandoned') setDebrief(last);
  }, [records]);
  // Weekly review (PLAN 2.3): auto-surface at most once per calendar week,
  // only while idle, only when the week actually has sessions to reflect on.
  // Settings can open it on demand any time (via onShowWeekly below).
  const [weekly, setWeekly] = useState(false);

  // Never mid-session: a new run sweeps the cards away even without a dismiss.
  useEffect(() => {
    if (state.running) {
      setDebrief(null);
      setWeekly(false);
      setRitualOpen(false);
      setWoopOpen(false);
    }
  }, [state.running]);

  // Changing timer tabs abandons the pending pre-start ritual, so it never
  // accidentally starts a different mode than the one the user chose.
  useEffect(() => setRitualOpen(false), [state.mode]);

  useEffect(() => {
    if (state.running || state.justDone || debrief || weekly || showSettings || hasBlockingReturnedParking || hasResumeCue) return;
    const week = weekKeyForStudyDay(state.today);
    if (state.lastWeeklyReviewWeek === week) return;
    const hasRecentStudyDay = groupSessionsByStudyDay(
      records,
      state.settings.dayStartHour,
    ).some((group) => {
      const age = daysBetween(group.day, state.today);
      return age >= 0 && age < WEEKLY_WINDOW_DAYS;
    });
    if (!hasRecentStudyDay) return;
    setWeekly(true);
    actions.markWeeklyReview(week);
  }, [state.running, state.justDone, debrief, weekly, showSettings, hasBlockingReturnedParking, hasResumeCue, records, state.lastWeeklyReviewWeek, state.settings.dayStartHour, state.today, actions]);

  // A fresh work run begins a new pause cycle; thoughts deferred during the
  // prior pause may return after this run ends.
  useEffect(() => {
    if (state.running && (state.mode === 'focus' || state.mode === 'tiny' || state.mode === 'flow')) {
      setParkingDeferred(false);
    }
  }, [state.running, state.mode]);

  // Pre-session if–then planner (PLAN 3.2): only before a fresh focus start —
  // a paused session already has its record (and plan) stamped.
  const showPlanner =
    state.mode === 'focus' && !state.running && !state.openFocus && !state.justDone;
  // PLAN 13.17: everything below the session target folds behind one row, so a
  // fresh Focus screen fits on a phone without the transport sliding under the
  // tab bar. Only worth offering when there is something in there to open.
  const prepCollapsible =
    showPlanner || (state.mode === 'focus' && state.ritual.enabled);
  const activeTaskId = activeTask?.id;
  // Remembered per task: default to the plan this task last started with.
  const rememberedPlanId = useMemo(() => {
    const own = state.ifThenPlans.filter((p) => p.taskId === activeTaskId);
    if (!own.length) return null;
    return own.reduce((a, b) =>
      (b.lastUsedAt ?? b.createdAt) > (a.lastUsedAt ?? a.createdAt) ? b : a,
    ).id;
  }, [state.ifThenPlans, activeTaskId]);
  // undefined = follow the per-task default; null = skipped for now.
  const [chosenPlanId, setChosenPlanId] = useState<string | null | undefined>(undefined);
  useEffect(() => setChosenPlanId(undefined), [activeTaskId]);
  const rawPlanId = chosenPlanId === undefined ? rememberedPlanId : chosenPlanId;
  // A remembered plan that has since been deleted counts as no plan.
  const planId = state.ifThenPlans.some((p) => p.id === rawPlanId) ? rawPlanId : null;

  const freshWorkStart =
    !state.running &&
    !state.justDone &&
    ((state.mode === 'focus' || state.mode === 'tiny') ? !state.openFocus : state.mode === 'flow' ? !state.openFlow : false);

  // Conditional WOOP offer (PLAN 3.5): the pure trigger requires three
  // trailing abandons, a new abandon since the prior offer, and a seven-day
  // cooldown. The persisted timestamp is marked when the card is presented,
  // not when it is completed, so dismissing it can never cause another nudge.
  const woopTriggered = shouldOfferWoop(records, state.lastWoopOfferAt);
  const woopEligible =
    woopTriggered &&
    state.mode === 'focus' &&
    freshWorkStart &&
    !ritualOpen &&
    !showSettings &&
    !debrief &&
    !recordAwaitingDebrief &&
    !weekly &&
    !hasResumeCue &&
    !hasBlockingReturnedParking;

  useEffect(() => {
    if (!woopEligible || woopOpen) return;
    setWoopOpen(true);
    // Offer history records the actual presentation instant, not a day signal.
    actions.markWoopOffered(Date.now());
  }, [actions, woopEligible, woopOpen]);

  const ritualSuggestionEligible =
    state.mode === 'focus' &&
    freshWorkStart &&
    !state.ritual.enabled &&
    !state.ritual.suggestionSeen &&
    !ritualOpen &&
    !showSettings &&
    !debrief &&
    !weekly &&
    !woopTriggered &&
    !woopOpen &&
    !hasResumeCue &&
    !hasBlockingReturnedParking;

  // Offer this exactly once. The persisted flag is set when it is presented,
  // while local UI state keeps the little pet prompt visible for this visit.
  useEffect(() => {
    if (ritualSuggestionEligible && !ritualSuggestionOpen) {
      setRitualSuggestionOpen(true);
      actions.patchRitual({ suggestionSeen: true });
    }
  }, [actions, ritualSuggestionEligible, ritualSuggestionOpen]);

  useEffect(() => {
    if (showSettings || ritualOpen || state.mode !== 'focus' || state.running || state.justDone || debrief || weekly) {
      setRitualSuggestionOpen(false);
    }
  }, [showSettings, ritualOpen, state.mode, state.running, state.justDone, debrief, weekly]);

  const showRitualSuggestion =
    ritualSuggestionOpen &&
    state.mode === 'focus' &&
    freshWorkStart &&
    !ritualOpen &&
    !showSettings &&
    !debrief &&
    !weekly &&
    !hasResumeCue &&
    !woopOpen;

  function beginSession() {
    const ifThenPlanId = showPlanner && planId ? planId : undefined;
    if (state.ritual.enabled && freshWorkStart) {
      setRitualOpen(true);
      return;
    }
    startSession(ifThenPlanId);
  }

  function startSession(ifThenPlanId?: string) {
    actions.toggle(ifThenPlanId, targetDraft);
    // The active record owns the target from here.
    setTargetDraft('');
  }

  function requestTransition(intent: TimerTransitionIntent, action: () => void): boolean {
    const decision = timerTransitionPolicy(state, intent);
    if (decision.kind === 'allow') {
      action();
      return true;
    }
    if (decision.kind === 'discardFalseStart') {
      actions.discardFalseStart();
      action();
      return true;
    }
    pendingTransitionAction.current = action;
    setPendingTransition(decision);
    return false;
  }

  function cancelTransition() {
    pendingTransitionAction.current = null;
    setPendingTransition(null);
  }

  function confirmTransition() {
    const action = pendingTransitionAction.current;
    if (!action) return;
    pendingTransitionAction.current = null;
    setPendingTransition(null);
    action();
  }

  function answerTarget(recordId: string, targetOutcome: TargetOutcome) {
    actions.setTargetOutcome(recordId, targetOutcome);
    setDebrief((current) =>
      current?.id === recordId ? { ...current, targetOutcome } : current,
    );
  }

  function resolveGoalCredit(recordId: string, amount: number | null) {
    actions.resolveGoalCredit('session', recordId, amount != null, amount ?? undefined);
    setDebrief((current) =>
      current?.id === recordId
        ? { ...current, goalCredit: amount != null ? 'credited' : 'skipped' }
        : current,
    );
  }

  const isFlow = state.mode === 'flow';
  const isTiny = state.mode === 'tiny';
  const activeSessionTarget = (isFlow ? state.openFlow : state.openFocus)?.targetText;
  const activeSessionTaskId = (isFlow ? state.openFlow : state.openFocus)?.taskId;
  const activeSessionTask = activeSessionTaskId == null
    ? undefined
    : state.tasks.find((task) => task.id === activeSessionTaskId);
  const focusLen = state.settings.durations.focus || 1;
  // Flow: `remaining` holds elapsed seconds and the ring fills once per
  // focus-length, lap after lap — the stopwatch's quiet nod to the pomodoro.
  const total = state.mode === 'flow'
    ? focusLen
    : state.mode === 'tiny'
      ? (state.openFocus?.plannedMin ?? tinyMinutes) * 60
      : state.mode === 'focus'
        ? (state.openFocus?.plannedMin ?? state.settings.durations.focus / 60) * 60
        : state.settings.durations[state.mode] || 1;
  const ringFrac = isFlow ? (state.remaining % focusLen) / focusLen : state.remaining / total;
  const ringOffset = RING_C * (1 - ringFrac);
  // Shared with finishFlow so the displayed bank preview cannot disagree
  // with the reducer at half-block boundaries (PLAN 7.4f).
  const laps = isFlow ? flowCreditsForElapsed(state.remaining, focusLen) : 0;

  const modes: TimerMode[] = state.settings.flow
    ? ['focus', 'flow', 'tiny', 'short', 'long']
    : ['focus', 'tiny', 'short', 'long'];
  const idx = Math.max(0, modes.indexOf(state.mode));
  const pillW = `calc((100% - 8px) / ${modes.length})`;

  // Session dots: progress through the current cycle of 4. All four stay lit
  // through the celebrate + long-break stretch, then reset for the next cycle.
  const cyc = state.sessions % 4;
  const filled =
    cyc === 0 && state.sessions > 0 && (state.justDone || state.mode !== 'focus') ? 4 : cyc;

  const todayGoalTargets = useMemo(
    () =>
      (state.dayPlan?.targets ?? [])
        .filter(
          (target) =>
            target.dayKey === state.today &&
            isGoalDailyTarget(target) &&
            state.goals.some((goal) => goal.id === target.goalId),
        )
        .sort((left, right) => {
          const leftProgress = targetActual(left, state.goalLedger) / left.plannedAmount;
          const rightProgress = targetActual(right, state.goalLedger) / right.plannedAmount;
          return leftProgress - rightProgress || left.createdAt - right.createdAt;
        }),
    [state.dayPlan?.targets, state.goalLedger, state.goals, state.today],
  );
  const armedTargetIndex = todayGoalTargets.findIndex(
    (target) => target.goalId === state.armedGoalId,
  );
  const shownTargetIndex =
    armedTargetIndex >= 0
      ? armedTargetIndex
      : Math.min(dayTargetIndex, Math.max(0, todayGoalTargets.length - 1));
  const shownTarget = todayGoalTargets[shownTargetIndex];
  const shownTargetActual = shownTarget
    ? targetActual(shownTarget, state.goalLedger)
    : 0;
  const shownTargetArmed = shownTarget?.goalId === state.armedGoalId;
  const debriefTarget =
    debrief?.goalId == null
      ? undefined
      : (state.dayPlan?.targets ?? []).find(
          (target) =>
            isGoalDailyTarget(target) &&
            target.goalId === debrief.goalId &&
            target.dayKey === dayKeyFor(debrief.endedAt, state.settings.dayStartHour),
        );
  const debriefGoal =
    debrief?.goalId == null
      ? undefined
      : state.goals.find(
          (goal) => goal.id === debrief.goalId && goal.done < goal.target,
        );
  const debriefGoalPace = debriefGoal
    ? goalPaceForStudyDay(debriefGoal, state.today, now)
    : null;
  const debriefGoalSuggestedAmount = debriefGoal
    ? Math.min(
        debriefGoal.target - debriefGoal.done,
        Math.max(1, Math.ceil(debriefGoalPace?.perDay ?? 1)),
      )
    : 0;
  const debriefGoalEffortLine = debriefGoal
    ? sessionEffortLine(
        debriefGoalSuggestedAmount,
        goalUnit(debriefGoal),
        medianSessionCredit(state.goalLedger, debriefGoal.id, now),
      )
    : null;

  const lastRecord = records.length ? records[records.length - 1] : undefined;
  const showTinyOffer = state.justDone && isTiny && isTinyFirstRung(lastRecord);
  const coordinatedCompanionPrompt = companionPromptForSurface(
    companion.prompt,
    companion.enabled,
    companion.conf.quiet,
  );
  const surface = resolveFocusSurface({
    returnTruth: Boolean(activeReturnSession),
    transitionConfirm: Boolean(pendingTransition),
    settings: showSettings,
    completionAlert: completionAlerts.primerOpen,
    resumeInterrupted: Boolean(interruptedReturnSession),
    tinyComplete: showTinyOffer,
    returnedParking:
      hasBlockingReturnedParking &&
      (!state.running || state.mode === 'short' || state.mode === 'long'),
    debrief: Boolean(debrief && !state.running && !state.justDone),
    weekly: Boolean(weekly && !state.running && !state.justDone),
    ritual: Boolean(ritualOpen && freshWorkStart),
    woop: Boolean(woopOpen && !state.running && !state.justDone),
    ritualSuggestion: showRitualSuggestion,
    companionPrompt: coordinatedCompanionPrompt,
  });

  // PLAN 13.17: WOOP takes the screen when it opens, so the fold can never be
  // what hides it.
  const prepExpanded = prepOpen || surface.owner === 'woop';

  // Native views always composite above WKWebView, independent of web z-index.
  // Dialogs portal to document.body, so observe that portal host (rather than
  // the Focus <main>) to catch locally-owned presentations such as the
  // foundations picker and clear native chrome.
  useEffect(() => {
    if (!isNativeIOSTabsPlatform()) return;
    const root = document.body;
    const update = () => setNativeWebOverlayOpen(Boolean(root.querySelector('.dialog-layer')));
    const observer = new MutationObserver(update);
    observer.observe(root, { childList: true, subtree: true });
    update();
    return () => observer.disconnect();
  }, []);

  const configureNativeModeControl = (frame = nativeModeFrameRef.current) => {
    if (!frame) return Promise.resolve({ active: false, height: 0 });
    return configureNativeIOSSegment({
      kind: 'focusModes',
      items: modes.map((modeOption) => ({
        id: modeOption,
        title: MODE_LABEL[modeOption],
      })),
      selected: state.mode,
      enabled: !surface.blocksTimerControls,
      visible: surface.owner === 'none' && !nativeWebOverlayOpen,
      frame,
    });
  };

  const configureNativeSettingsControl = (frame = nativeSettingsFrame) => {
    const element = nativeSettingsSlotRef.current;
    if (!frame || !element) return Promise.resolve({ active: false });
    return configureNativeIOSAuxiliaryControl({
      id: 'settings',
      kind: 'settingsButton',
      label: 'Settings',
      enabled: !surface.blocksTimerControls,
      visible:
        surface.owner === 'none' &&
        !nativeWebOverlayOpen &&
        isNativeControlSlotVisible(element, frame),
      frame,
    });
  };

  // Native views sit above WKWebView regardless of CSS z-index. Hide both the
  // mode rail and native bottom navigation while a Focus overlay owns the UI.
  useEffect(() => {
    onNativeOverlayChange?.(surface.owner !== 'none' || nativeWebOverlayOpen);
    return () => onNativeOverlayChange?.(false);
  }, [nativeWebOverlayOpen, onNativeOverlayChange, surface.owner]);

  nativeModeSelectionRef.current = (value) => {
    if (!isNativeTimerMode(value) || !modes.includes(value)) return;
    if (surface.blocksTimerControls) {
      void configureNativeModeControl();
      return;
    }
    const accepted = requestTransition('mode', () =>
      value === 'tiny' ? actions.pickTiny(tinyMinutes) : actions.pick(value),
    );
    if (!accepted) void configureNativeModeControl();
  };
  nativeSettingsActionRef.current = () => {
    if (surface.blocksTimerControls || surface.owner !== 'none') {
      void configureNativeSettingsControl();
      return;
    }
    setShowSettings(true);
  };

  // PLAN 13.3: a second system UITabBar owns the iOS 26 Liquid Glass rail
  // (with UISegmentedControl on older iOS); the reducer still owns whether a
  // requested mode change lands.
  useEffect(() => {
    if (!isNativeIOSTabsPlatform()) return;

    let disposed = false;
    let listener: Awaited<ReturnType<typeof listenForNativeIOSSegmentSelection>> | null = null;
    void listenForNativeIOSSegmentSelection(({ kind, value }) => {
      if (kind === 'focusModes') nativeModeSelectionRef.current(value);
    })
      .then((handle) => {
        if (disposed) void handle.remove();
        else listener = handle;
      })
      .catch(() => {
        if (!disposed) setNativeModeReady(false);
      });

    return () => {
      disposed = true;
      if (listener) void listener.remove();
      void hideNativeIOSSegment('focusModes');
    };
  }, []);

  useEffect(() => {
    if (!isNativeIOSTabsPlatform()) return;
    let disposed = false;
    let listener: Awaited<
      ReturnType<typeof listenForNativeIOSAuxiliaryControlActivation>
    > | null = null;
    void listenForNativeIOSAuxiliaryControlActivation((event) => {
      if (event.id === 'settings' && event.value === undefined) {
        nativeSettingsActionRef.current();
      }
    })
      .then((handle) => {
        if (disposed) void handle.remove();
        else listener = handle;
      })
      .catch(() => {
        if (!disposed) setNativeSettingsReady(false);
      });

    return () => {
      disposed = true;
      if (listener) void listener.remove();
      void hideNativeIOSAuxiliaryControl('settings');
    };
  }, []);

  useEffect(() => {
    if (!isNativeIOSTabsPlatform() || !nativeSettingsSlotRef.current) return;
    return observeNativeControlFrame(nativeSettingsSlotRef.current, setNativeSettingsFrame);
  }, []);

  useEffect(() => {
    if (!isNativeIOSTabsPlatform() || !nativeSettingsFrame) return;
    let disposed = false;
    void configureNativeSettingsControl(nativeSettingsFrame)
      .then(({ active }) => {
        if (!disposed) setNativeSettingsReady(active);
      })
      .catch(() => {
        void hideNativeIOSAuxiliaryControl('settings');
        if (!disposed) setNativeSettingsReady(false);
      });
    return () => {
      disposed = true;
    };
  }, [
    nativeSettingsFrame,
    nativeWebOverlayOpen,
    surface.blocksTimerControls,
    surface.owner,
  ]);

  useEffect(() => {
    if (!isNativeIOSTabsPlatform() || !nativeModeSlotRef.current) return;

    let disposed = false;
    const stopObserving = observeNativeControlFrame(nativeModeSlotRef.current, (frame) => {
      nativeModeFrameRef.current = frame;
      void configureNativeModeControl(frame)
        .then(({ active, height }) => {
          if (disposed) return;
          setNativeModeReady(active);
          // Converges: once the slot is at least as tall as the system needs,
          // the reported height equals the slot's own height and stops moving.
          setNativeModeHeight((current) =>
            Math.abs(height - current) > 0.5 ? height : current,
          );
        })
        .catch(() => {
          if (!disposed) setNativeModeReady(false);
        });
    });

    return () => {
      disposed = true;
      stopObserving();
    };
  }, [
    nativeWebOverlayOpen,
    state.mode,
    state.settings.flow,
    surface.blocksTimerControls,
    surface.owner,
    tinyMinutes,
  ]);

  const workSessionOpen =
    Boolean(isFlow ? state.openFlow : state.openFocus) &&
    (state.mode === 'focus' || state.mode === 'tiny' || state.mode === 'flow') &&
    !state.justDone;
  const breakGuideEligible =
    Boolean(lastRecord) &&
    (state.mode === 'short' || state.mode === 'long') &&
    !debrief &&
    !weekly &&
    !showSettings &&
    !showTinyOffer &&
    !hasResumeCue &&
    !hasBlockingReturnedParking;
  const guideEvents = useMemo(() => loadEvents(), [records]);
  const breakGuideSuggestion = useMemo(
    () => breakGuideEligible && lastRecord
      ? (() => {
          // Window/cap checks need the fresh computation instant; `now` is
          // the store-owned day signal that invalidates this memo at rollover.
          const computedAt = Date.now();
          return guideSuggestionFor({
            kind: 'break',
            momentKey: `break:${lastRecord.id}`,
            record: lastRecord,
            records,
            events: guideEvents,
            workSessionRunning: false,
          }, state.guideRead, computedAt, state.settings.dayStartHour);
        })()
      : null,
    [
      breakGuideEligible,
      guideEvents,
      lastRecord,
      now,
      records,
      state.guideRead,
      state.settings.dayStartHour,
    ],
  );
  useEffect(() => {
    if (breakGuideSuggestion) {
      actions.markGuideArticleSuggested(
        breakGuideSuggestion.articleId,
        breakGuideSuggestion.momentKey,
      );
    }
  }, [actions, breakGuideSuggestion]);

  const nowChip = (
    <div className="now-chip">
      <span className="now-badge">{state.mode === 'short' || state.mode === 'long' ? '☕' : '✓'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="now-label">
          {state.mode === 'short' || state.mode === 'long' ? 'Up next' : 'Now focusing on'}
        </div>
        <div className="now-task">
          {(activeSessionTask ?? activeTask)?.t ?? 'all done — go play!'}
        </div>
      </div>
      <div className="session-dots">
        {Array.from({ length: 4 }, (_, i) => (
          <span key={i} className={`sdot ${i < filled ? 'on' : 'off'}`} />
        ))}
      </div>
    </div>
  );

  return (
    <main
      className={`screen focus-bg${freshWorkStart ? ' prestart-scroll' : ''}${
        prepExpanded ? ' prep-open' : ''
      }${nativeModeReady ? ' native-mode-control' : ''}`}
      id="focus-screen"
      aria-labelledby="focus-heading"
    >
      <div className="greeting-row">
        <div>
          <h1
            className="greeting"
            id="focus-heading"
            aria-label={`Focus. Hi, ${state.settings.name}`}
          >
            Hi, {state.settings.name}
          </h1>
          <div className="status-label">{statusLabel}</div>
        </div>
        <div className="greeting-side">
          {/* Gentle streak (PLAN 5.4): a longer pause greets the return —
              never a zero, never a loss animation. */}
          {state.comeBack ? (
            <div
              className="streak-chip comeback"
              title="Hi again! Any finished session starts the count growing — consistency is a months game."
            >
              <span className="streak-dot" />
              <span className="streak-unit">welcome back 🌱</span>
            </div>
          ) : (
            <div
              className="streak-chip"
              title="Days with a finished session. One rest day a week is free — a single quiet day keeps it growing."
            >
              <span className="streak-dot" />
              {state.streak > 0 ? (
                <>
                  <span className="streak-num">{state.streak}</span>
                  <span className="streak-unit">{state.streak === 1 ? 'day' : 'days'} growing</span>
                </>
              ) : (
                <span className="streak-unit">ready to grow 🌱</span>
              )}
            </div>
          )}
          <button
            ref={nativeSettingsSlotRef}
            className={`gear-btn${nativeSettingsReady ? ' native-control-slot-ready' : ''}`}
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            aria-hidden={nativeSettingsReady || undefined}
            tabIndex={nativeSettingsReady ? -1 : undefined}
            disabled={surface.blocksTimerControls}
          >
            <svg className="gear-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="7.3" fill="none" stroke="currentColor" strokeWidth="2" />
              <circle cx="12" cy="12" r="2.7" fill="none" stroke="currentColor" strokeWidth="2" />
              <path
                d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M19.4 4.6l-2.1 2.1M6.7 17.3l-2.1 2.1"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2.2"
              />
            </svg>
          </button>
        </div>
      </div>

      <div
        ref={nativeModeSlotRef}
        className={`tabs${nativeModeReady ? ' native-segment-slot-ready' : ''}`}
        style={
          nativeModeReady && nativeModeHeight > 0
            ? { minHeight: `${Math.ceil(nativeModeHeight)}px` }
            : undefined
        }
      >
        <div
          className="tabs-pill"
          style={{ width: pillW, transform: `translateX(${idx * 100}%)` }}
        />
        <div className="tabs-inner">
          {modes.map((m) => (
            <button
              key={m}
              className="tab-btn"
              aria-pressed={state.mode === m}
              disabled={surface.blocksTimerControls}
              onClick={() =>
                requestTransition('mode', () =>
                  m === 'tiny' ? actions.pickTiny(tinyMinutes) : actions.pick(m),
                )
              }
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      {state.settings.planner &&
        state.mode === 'focus' &&
        !state.running &&
        !state.justDone &&
        shownTarget && (
          <div className="day-target-strip" aria-label="Today's goal target">
            <button
              type="button"
              className="day-target-label"
              onClick={onOpenGoals}
              disabled={!onOpenGoals}
            >
              🌱 {shownTarget.snapshot.title} · {shownTargetActual} of {shownTarget.plannedAmount}{' '}
              {shownTarget.snapshot.unit} · today {shownTargetActual}/{shownTarget.plannedAmount}
            </button>
            <button
              type="button"
              className="day-target-arm"
              aria-pressed={shownTargetArmed}
              onClick={() => actions.armGoal(shownTargetArmed ? null : (shownTarget.goalId ?? null))}
            >
              {shownTargetArmed ? 'armed ✓' : 'count next session'}
            </button>
            {todayGoalTargets.length > 1 && (
              <button
                type="button"
                className="day-target-next"
                aria-label="Show next daily target"
                onClick={() =>
                  setDayTargetIndex((shownTargetIndex + 1) % todayGoalTargets.length)
                }
              >
                ›
              </button>
            )}
          </div>
        )}

      {isTiny && !state.running && !state.openFocus && !state.justDone && (
        <div className="tiny-picker" role="group" aria-label="Tiny start length">
          <span className="tiny-picker-label">pick one small first rung</span>
          <span className="tiny-picker-options">
            {TINY_START_OPTIONS.map((minutes) => (
              <button
                key={minutes}
                className={`tiny-choice${tinyMinutes === minutes ? ' on' : ''}`}
                aria-pressed={tinyMinutes === minutes}
                onClick={() => {
                  setTinyMinutes(minutes);
                  requestTransition('mode', () => actions.pickTiny(minutes));
                }}
              >
                {minutes} min
              </button>
            ))}
          </span>
        </div>
      )}

      <div className="ring-wrap">
        <svg className="ring-svg" width="236" height="236" viewBox="0 0 236 236">
          <defs>
            <linearGradient id="ringgrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffb0d4" />
              <stop offset="1" stopColor="#c79fe6" />
            </linearGradient>
          </defs>
          <circle cx="118" cy="118" r={RING_R} fill="none" stroke="rgba(183,159,227,.18)" strokeWidth="15" />
          <circle
            cx="118"
            cy="118"
            r={RING_R}
            fill="none"
            stroke="url(#ringgrad)"
            strokeWidth="15"
            strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={ringOffset}
            transform="rotate(-90 118 118)"
            style={{ transition: 'stroke-dashoffset 0.4s linear' }}
          />
        </svg>
        <div className="ring-disc" />
        <div className="ring-shadow" />
        <PixelPal sprite={palSprite} mode={mood} scale={6} size={116} className="ring-animal" />
      </div>

      <div className="readout">
        <div className="readout-time">{isFlow ? clock(state.remaining) : mmss(state.remaining)}</div>
        {isFlow && !state.justDone && (
          <div className="intention-line">
            {laps > 0
              ? `${laps} bloom${laps === 1 ? '' : 's'} on the clock — finish to bank ${laps === 1 ? 'it' : 'them'}`
              : state.running
                ? 'counting up — stop whenever it stops flowing'
                : 'a stopwatch instead of a countdown — just press play'}
          </div>
        )}
        {activeSessionTarget && !state.justDone && (
          <div className="intention-line">✦ target: {activeSessionTarget}</div>
        )}
        {companion.summary && !(state.running && state.mode === 'focus') && (
          <div className="intention-line">{companion.summary}</div>
        )}
      </div>

      {freshWorkStart && (
        <section className="prestart-stack" aria-label="Before this session">
          {nowChip}

          {companion.conf.intention && (
            <label className="prestart-target">
              <span>one doable thing for this session <span aria-hidden="true">·</span> optional</span>
              <input
                className="intention-input"
                value={targetDraft}
                maxLength={SESSION_TARGET_MAX}
                onChange={(e) => {
                  const next = e.target.value.slice(0, SESSION_TARGET_MAX);
                  setTargetDraft(next);
                }}
                placeholder="name the first visible finish line"
                aria-label="Session target"
              />
            </label>
          )}

          {/* PLAN 13.17: the target keeps its place — naming one doable thing
              is the part with a behaviour-change reason behind it. The rest of
              the preparation folds into one row so the transport controls are
              never pushed under the tab bar on a phone. Opening it is one tap,
              and a surface that owns the screen (WOOP) opens it itself. */}
          {prepCollapsible && !prepExpanded && (
            <button
              type="button"
              className="prestart-prep-toggle"
              aria-expanded={false}
              aria-controls="prestart-prep"
              onClick={() => setPrepOpen(true)}
            >
              <span aria-hidden="true">✦</span> a little more prep
              <span>optional</span>
            </button>
          )}

          <div
            className="prestart-prep"
            id="prestart-prep"
            aria-label="Optional preparation"
            hidden={prepCollapsible && !prepExpanded}
          >
            {showPlanner && !woopOpen && (
              <IfThenPlanner
                plans={state.ifThenPlans}
                selectedId={planId}
                onSelect={(id) => setChosenPlanId(id)}
                onClear={() => setChosenPlanId(null)}
                onCreate={(cueType, cueText, actionText) =>
                  actions.addIfThenPlan(cueType, cueText, actionText)
                }
                onRemove={(id) => actions.removeIfThenPlan(id)}
              />
            )}
            {state.mode === 'focus' && state.ritual.enabled && !woopOpen && (
              <button
                type="button"
                className="prestart-ritual"
                onClick={() => setRitualOpen(true)}
              >
                🌱 tiny environment reset <span>optional · skip anytime</span>
              </button>
            )}
            {surface.owner === 'woop' && (
              <WoopCard
                plans={state.ifThenPlans}
                selectedId={planId}
                palSprite={palSprite}
                onSelectPlan={(id) => setChosenPlanId(id)}
                onClearPlan={() => setChosenPlanId(null)}
                onCreatePlan={(cueType, cueText, actionText) =>
                  actions.addIfThenPlan(cueType, cueText, actionText)
                }
                onRemovePlan={(id) => actions.removeIfThenPlan(id)}
                onDismiss={() => setWoopOpen(false)}
              />
            )}
          </div>
        </section>
      )}

      <div className="controls">
        <button
          className="ctrl-round ctrl-reset"
          onClick={() => requestTransition('reset', actions.reset)}
          aria-label="Reset"
          disabled={surface.blocksTimerControls}
        >
          &#8634;
        </button>
        <button
          className="ctrl-play"
          onClick={beginSession}
          aria-label={state.running ? 'Pause' : 'Start'}
          disabled={surface.blocksTimerControls}
        >
          {state.running ? (
            <span className="pause-bars">
              <span />
              <span />
            </span>
          ) : (
            <span className="play-tri" />
          )}
        </button>
        {isFlow ? (
          <button
            className="ctrl-round ctrl-finish"
            onClick={actions.finishFlow}
            disabled={surface.blocksTimerControls || (state.remaining < 1 && !state.running)}
            aria-label="Finish flow session"
            title="finish & bank this session"
          >
            &#10003;
          </button>
        ) : (
          <button
            className="ctrl-round ctrl-skip"
            onClick={() => requestTransition('skip', actions.skip)}
            aria-label="Skip"
            disabled={surface.blocksTimerControls}
          >
            &#187;
          </button>
        )}
      </div>

      <ParkingLot
        canPark={workSessionOpen}
        // Breaks are the parking lot's moment: the card stays up while a break
        // runs so the items can actually be done during it, and never gates
        // the timer — "start my break ▸" / "not now ♡" live on the card.
        showReturned={surface.owner === 'returnedParking'}
        returned={returnedParking}
        palSprite={palSprite}
        breakIdle={
          (state.mode === 'short' || state.mode === 'long') && !state.running && !state.justDone
        }
        onStartBreak={beginSession}
        onPark={actions.parkThought}
        onSendToTasks={actions.sendParkedToTasks}
        onDismiss={actions.dismissParked}
        onSnoozeReturned={() => setParkingDeferred(true)}
      />

      {state.settings.foundations &&
        (state.mode === 'short' || state.mode === 'long') && (
          <FoundationsCard
            compact
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

      {breakGuideSuggestion && (
        <GuideSuggestion
          articleId={breakGuideSuggestion.articleId}
          reason={breakGuideSuggestion.reason}
          onOpen={onOpenGuideArticle}
        />
      )}

      {resumeSession &&
        (surface.owner === 'returnTruth' || surface.owner === 'resumeInterrupted') && (
        <ResumeCue
          palSprite={palSprite}
          session={resumeSession}
          snapshot={activeReturnSession?.returnSnapshot}
          parkedText={resumeParkedText}
          onSaveNextAction={(text) => actions.setNextAction(resumeSession.id, text)}
          onKeptWorking={
            activeReturnSession ? () => actions.resolveTabReturn('focused') : undefined
          }
          onDrifted={activeReturnSession ? companion.actions.returnDrifted : undefined}
          onPauseBack={
            activeReturnSession ? () => actions.resolveTabReturn('pauseBack') : undefined
          }
          onResumeInterrupted={
            interruptedReturnSession
              ? () => actions.resumeInterrupted(interruptedReturnSession.id)
              : undefined
          }
          onDismissInterrupted={
            interruptedReturnSession
              ? () => actions.dismissResumeCue(interruptedReturnSession.id)
              : undefined
          }
        />
      )}

      {surface.owner === 'tinyComplete' && (
        <div className="companion-pop tiny-rung-card" role="status" aria-label="Tiny start complete">
          <PixelPal sprite={palSprite} mode="idle" scale={3} size={64} className="pop-pal" />
          <div className="pop-body">
            <div className="pop-text">tiny start complete — that counts ♡</div>
            <div className="tiny-rung-question">keep going for {TINY_EXTENSION_MIN}?</div>
            <div className="pop-actions">
              <button className="pop-btn primary" onClick={actions.extendTiny}>
                yes, {TINY_EXTENSION_MIN} more
              </button>
              <button className="pop-btn" onClick={actions.declineTiny}>
                done for now ♡
              </button>
            </div>
          </div>
        </div>
      )}

      {surface.owner === 'ritual' && (
        <RitualCard
          items={state.ritual.items}
          sprite={palSprite}
          onStart={() => {
            setRitualOpen(false);
            startSession(showPlanner && planId ? planId : undefined);
          }}
          onSkip={() => {
            setRitualOpen(false);
            startSession(showPlanner && planId ? planId : undefined);
          }}
        />
      )}

      {!freshWorkStart && nowChip}

      {debrief && surface.owner === 'debrief' && (
        <DebriefCard
          record={debrief}
          records={records}
          palSprite={palSprite}
          onTargetOutcome={(targetOutcome) => answerTarget(debrief.id, targetOutcome)}
          goalTitle={
            debriefGoal?.title
          }
          goalUnit={debriefGoal ? goalUnit(debriefGoal) : undefined}
          goalRemaining={
            debriefGoal ? debriefGoal.target - debriefGoal.done : undefined
          }
          goalPacePerDay={debriefGoalPace?.perDay}
          goalEffortLine={debriefGoalEffortLine}
          onResolveGoalCredit={(amount) => resolveGoalCredit(debrief.id, amount)}
          dailyTargetEcho={
            debriefTarget
              ? {
                  title: debriefTarget.snapshot.title,
                  actual: targetActual(debriefTarget, state.goalLedger),
                  planned: debriefTarget.plannedAmount,
                  unit: debriefTarget.snapshot.unit,
                }
              : undefined
          }
          onTinyRestart={(nextStep) => {
            setDebrief(null);
            setTinyMinutes(TINY_START_OPTIONS[0]);
            actions.pickTiny(TINY_START_OPTIONS[0]);
            actions.toggle(undefined, nextStep);
          }}
          guideRead={state.guideRead}
          now={now}
          dayStartHour={state.settings.dayStartHour}
          onGuideSuggested={actions.markGuideArticleSuggested}
          onOpenGuideArticle={onOpenGuideArticle}
          onRepair={(proposal) => setDebrief(actions.repairSession(proposal))}
          onDismiss={() => setDebrief(null)}
        />
      )}

      {/* The debrief takes precedence — one card at a time, never mid-session. */}
      {weekly && surface.owner === 'weekly' && (
        <WeeklyReview
          records={records}
          now={now}
          studyDay={state.today}
          dayStartHour={state.settings.dayStartHour}
          foundations={state.foundations}
          dayPlan={state.dayPlan}
          goalLedger={state.goalLedger}
          palSprite={palSprite}
          currentCadence={{
            focusMin: Math.round(state.settings.durations.focus / 60),
            breakMin: Math.round(state.settings.durations.short / 60),
          }}
          personalCadence={state.personalCadence}
          chronotype={state.settings.chronotype}
          guideRead={state.guideRead}
          onGuideSuggested={actions.markGuideArticleSuggested}
          onOpenGuideArticle={onOpenGuideArticle}
          onCacheCadence={actions.cachePersonalCadence}
          onApplyCadence={actions.applyCadence}
          onDismiss={() => setWeekly(false)}
        />
      )}

      {surface.owner === 'ritualSuggestion' && (
        <RitualSuggestion
          sprite={palSprite}
          onEnable={() => {
            setRitualSuggestionOpen(false);
            actions.patchRitual({ enabled: true, suggestionSeen: true });
          }}
          onDismiss={() => {
            setRitualSuggestionOpen(false);
            actions.patchRitual({ suggestionSeen: true });
          }}
        />
      )}

      {showSettings && surface.owner === 'settings' && (
        <SettingsSheet
          settings={state.settings}
          records={records}
          personalCadence={state.personalCadence}
          now={now}
          ritual={state.ritual}
          running={state.running}
          hasOpenSession={Boolean(state.openFocus || state.openFlow)}
          persistedState={persistedShapeFromState(state)}
          onPatch={(patch) => {
            if (patch.flow === false) {
              requestTransition('flowOff', () => actions.patchSettings(patch));
            } else if (patch.durations) {
              requestTransition('duration', () => actions.patchSettings(patch));
            } else {
              actions.patchSettings(patch);
            }
          }}
          onCacheCadence={actions.cachePersonalCadence}
          onApplyCadence={(pair) =>
            requestTransition('cadence', () => actions.applyCadence(pair))
          }
          onPatchRitual={actions.patchRitual}
          onUpdateRitualItem={actions.updateRitualItem}
          onClearFocusData={actions.clearFocusData}
          onDataImported={actions.reloadPersistedState}
          onClose={() => setShowSettings(false)}
          completionAlertStatus={completionAlerts.status}
          onRequestCompletionAlertPermission={completionAlerts.requestPermission}
          liveActivityStatus={liveActivity.isIOS ? liveActivity.status : undefined}
          liveActivityChecking={liveActivity.checking}
          alarmStatus={alarms.isIOS ? alarms.status : undefined}
          onRequestAlarmAuthorization={alarms.requestAuthorization}
          onShowWeekly={() => {
            setShowSettings(false);
            setWeekly(true);
          }}
        />
      )}

      {completionAlerts.primerOpen && surface.owner === 'completionAlert' && (
        <Dialog
          title={
            completionAlerts.status.permission === 'prompt'
              ? 'Get a timer alert?'
              : 'Foreground chime only'
          }
          description={
            completionAlerts.status.permission === 'prompt' ? (
              'Bloom can chime while it’s open. Allow notifications so iOS can deliver a timer alert while Bloom is in the background or your device is locked. Silent Mode, Focus, and your notification settings still apply.'
            ) : (
              <span role="status">
                {completionAlerts.status.permission === 'denied'
                  ? 'Timer alerts are off in iOS Settings. Bloom can still chime while it’s open.'
                  : 'Background timer alerts aren’t available right now. Bloom can still chime while it’s open.'}
              </span>
            )
          }
          onRequestClose={completionAlerts.dismissPrimer}
          closeLabel="Close timer alert explanation"
          initialFocusRef={completionAlertLaterRef}
        >
          <div className="dialog-actions">
            <button
              ref={completionAlertLaterRef}
              type="button"
              className="dialog-button"
              onClick={completionAlerts.dismissPrimer}
            >
              {completionAlerts.status.permission === 'prompt' ? 'not now' : 'got it'}
            </button>
            {completionAlerts.status.permission === 'prompt' && (
              <button
                type="button"
                className="dialog-button primary"
                onClick={() => void completionAlerts.requestPermission()}
              >
                allow notifications
              </button>
            )}
          </div>
        </Dialog>
      )}

      {pendingTransition && surface.owner === 'transitionConfirm' && (
        <Dialog
          title={pendingTransition.title}
          description={pendingTransition.description}
          onRequestClose={cancelTransition}
          closeLabel="Keep going"
          initialFocusRef={keepTransitionRef}
        >
          <div className="dialog-actions">
            <button
              ref={keepTransitionRef}
              type="button"
              className="dialog-button"
              onClick={cancelTransition}
            >
              keep going
            </button>
            <button
              type="button"
              className="dialog-button danger"
              onClick={confirmTransition}
            >
              {pendingTransition.confirmLabel}
            </button>
          </div>
        </Dialog>
      )}

      {surface.showCompanionPrompt && (
        <CompanionPrompt
          companion={companion}
          palSprite={palSprite}
          focusLabel={activeSessionTarget || activeSessionTask?.t || activeTask?.t || null}
        />
      )}
    </main>
  );
}
