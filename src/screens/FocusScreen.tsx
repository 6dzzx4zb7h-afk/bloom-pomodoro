import { useEffect, useMemo, useRef, useState } from 'react';
import { DebriefCard } from '../components/DebriefCard';
import { IfThenPlanner } from '../components/IfThenPlanner';
import { ParkingLot } from '../components/ParkingLot';
import { PixelPal } from '../components/PixelPal';
import { RitualCard, RitualSuggestion } from '../components/RitualCard';
import { SettingsSheet } from '../components/SettingsSheet';
import { WeeklyReview } from '../components/WeeklyReview';
import { WoopCard } from '../components/WoopCard';
import { shouldOfferWoop } from '../insights/triggers';
import { WEEKLY_WINDOW_DAYS, weekKey } from '../insights/weekly';
import type { SessionRecord, TargetOutcome } from '../store/sessions';
import {
  SESSION_TARGET_MAX,
  TINY_EXTENSION_MIN,
  TINY_START_OPTIONS,
  isTinyFirstRung,
  type TimerMode,
  type TinyStartMinutes,
  type useBloom,
} from '../store/useBloom';
import type { Companion } from '../store/useCompanion';

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
}: {
  bloom: ReturnType<typeof useBloom>;
  companion: Companion;
}) {
  const { state, mood, statusLabel, palSprite, activeTask, actions, mmss, clock } = bloom;
  const [showSettings, setShowSettings] = useState(false);
  const [tinyMinutes, setTinyMinutes] = useState<TinyStartMinutes>(TINY_START_OPTIONS[0]);
  const [ritualOpen, setRitualOpen] = useState(false);
  const [ritualSuggestionOpen, setRitualSuggestionOpen] = useState(false);
  const [woopOpen, setWoopOpen] = useState(false);
  const [targetDraft, setTargetDraft] = useState(companion.intention);

  // Post-session debrief (PLAN 2.1): watch the session log for a record
  // finalized while this screen is up. Seeding the ref with the log's current
  // tail means boot-time 'interrupted' sweeps never trigger a card — only a
  // session the user just ended (completed or abandoned) does.
  const [debrief, setDebrief] = useState<SessionRecord | null>(null);
  const records = state.sessionRecords;
  const returnedParking = state.parking.filter((item) => item.revealedAt !== null);
  const hasReturnedParking = returnedParking.length > 0;
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
    if (state.running || state.justDone || debrief || weekly || showSettings || hasReturnedParking) return;
    const week = weekKey();
    if (state.lastWeeklyReviewWeek === week) return;
    const cutoff = Date.now() - WEEKLY_WINDOW_DAYS * 86400000;
    if (!records.some((r) => r.endedAt >= cutoff)) return;
    setWeekly(true);
    actions.markWeeklyReview(week);
  }, [state.running, state.justDone, debrief, weekly, showSettings, hasReturnedParking, records, state.lastWeeklyReviewWeek, actions]);

  // Pre-session intention: optional, skippable, only in Companion Mode.
  const wantsIntention =
    companion.enabled && companion.conf.intention && state.mode === 'focus' && !state.justDone;

  // Pre-session if–then planner (PLAN 3.2): only before a fresh focus start —
  // a paused session already has its record (and plan) stamped.
  const showPlanner =
    state.mode === 'focus' && !state.running && !state.openFocus && !state.justDone;
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
    !hasReturnedParking;

  useEffect(() => {
    if (!woopEligible || woopOpen) return;
    setWoopOpen(true);
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
    !hasReturnedParking;

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
    // The active record owns the target from here; leave Companion's copy in
    // place so its check-ins can still refer to it during focus sessions.
    setTargetDraft('');
  }

  function answerTarget(recordId: string, targetOutcome: TargetOutcome) {
    actions.setTargetOutcome(recordId, targetOutcome);
    setDebrief((current) =>
      current?.id === recordId ? { ...current, targetOutcome } : current,
    );
  }

  const isFlow = state.mode === 'flow';
  const isTiny = state.mode === 'tiny';
  const activeSessionTarget = (isFlow ? state.openFlow : state.openFocus)?.targetText;
  const focusLen = state.settings.durations.focus || 1;
  // Flow: `remaining` holds elapsed seconds and the ring fills once per
  // focus-length, lap after lap — the stopwatch's quiet nod to the pomodoro.
  const total = state.mode === 'flow'
    ? focusLen
    : state.mode === 'tiny'
      ? (state.openFocus?.plannedMin ?? tinyMinutes) * 60
      : state.settings.durations[state.mode] || 1;
  const ringFrac = isFlow ? (state.remaining % focusLen) / focusLen : state.remaining / total;
  const ringOffset = RING_C * (1 - ringFrac);
  // Whole focus-lengths already on the clock — what "finish" would bank.
  const laps = isFlow ? Math.floor(state.remaining / focusLen) : 0;

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

  const lastRecord = records.length ? records[records.length - 1] : undefined;
  const showTinyOffer = state.justDone && isTiny && isTinyFirstRung(lastRecord);
  const workSessionOpen =
    Boolean(isFlow ? state.openFlow : state.openFocus) &&
    (state.mode === 'focus' || state.mode === 'tiny' || state.mode === 'flow') &&
    !state.justDone;

  return (
    <div className="screen focus-bg">
      <div className="greeting-row">
        <div>
          <div className="greeting">Hi, {state.settings.name}</div>
          <div className="status-label">{statusLabel}</div>
        </div>
        <div className="greeting-side">
          <div className="streak-chip">
            <span className="streak-dot" />
            <span className="streak-num">{state.streak}</span>
            <span className="streak-unit">days</span>
          </div>
          <button className="gear-btn" onClick={() => setShowSettings(true)} aria-label="Settings">
            &#9881;
          </button>
        </div>
      </div>

      <div className="tabs">
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
              onClick={() => (m === 'tiny' ? actions.pickTiny(tinyMinutes) : actions.pick(m))}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

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
                  actions.pickTiny(minutes);
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
        <PixelPal sprite={palSprite} mode={mood} scale={6} size={130} className="ring-animal" />
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

      <div className="controls">
        <button className="ctrl-round ctrl-reset" onClick={actions.reset} aria-label="Reset">
          &#8634;
        </button>
        <button
          className="ctrl-play"
          onClick={beginSession}
          aria-label={state.running ? 'Pause' : 'Start'}
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
            disabled={state.remaining < 1 && !state.running}
            aria-label="Finish flow session"
            title="finish & bank this session"
          >
            &#10003;
          </button>
        ) : (
          <button className="ctrl-round ctrl-skip" onClick={actions.skip} aria-label="Skip">
            &#187;
          </button>
        )}
      </div>

      <ParkingLot
        canPark={workSessionOpen}
        showReturned={!state.running && !showTinyOffer}
        returned={returnedParking}
        palSprite={palSprite}
        onPark={actions.parkThought}
        onSendToTasks={actions.sendParkedToTasks}
        onDismiss={actions.dismissParked}
      />

      {showTinyOffer && (
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

      {ritualOpen && freshWorkStart && (
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

      {woopOpen && !state.running && !state.justDone && (
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

      {freshWorkStart && (
        <input
          className="intention-input"
          value={targetDraft}
          maxLength={SESSION_TARGET_MAX}
          onChange={(e) => {
            const next = e.target.value.slice(0, SESSION_TARGET_MAX);
            setTargetDraft(next);
            if (wantsIntention) companion.setIntention(next);
          }}
          placeholder="one specific doable thing (optional)"
          aria-label="Session target"
        />
      )}

      <div className="now-chip">
        <span className="now-badge">&#10003;</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="now-label">Now focusing on</div>
          <div className="now-task">{activeTask ? activeTask.t : 'all done — go play!'}</div>
        </div>
        <div className="session-dots">
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className={`sdot ${i < filled ? 'on' : 'off'}`} />
          ))}
        </div>
      </div>

      {debrief && !state.running && !state.justDone && !hasReturnedParking && (
        <DebriefCard
          record={debrief}
          records={records}
          palSprite={palSprite}
          onTargetOutcome={(targetOutcome) => answerTarget(debrief.id, targetOutcome)}
          onDismiss={() => setDebrief(null)}
        />
      )}

      {/* The debrief takes precedence — one card at a time, never mid-session. */}
      {weekly && !debrief && !state.running && !state.justDone && !hasReturnedParking && (
        <WeeklyReview
          records={records}
          palSprite={palSprite}
          currentCadence={{
            focusMin: Math.round(state.settings.durations.focus / 60),
            breakMin: Math.round(state.settings.durations.short / 60),
          }}
          personalCadence={state.personalCadence}
          chronotype={state.settings.chronotype}
          onCacheCadence={actions.cachePersonalCadence}
          onApplyCadence={actions.applyCadence}
          onDismiss={() => setWeekly(false)}
        />
      )}

      {showRitualSuggestion && (
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

      {showSettings && (
        <SettingsSheet
          settings={state.settings}
          records={records}
          personalCadence={state.personalCadence}
          ritual={state.ritual}
          running={state.running}
          onPatch={actions.patchSettings}
          onCacheCadence={actions.cachePersonalCadence}
          onApplyCadence={actions.applyCadence}
          onPatchRitual={actions.patchRitual}
          onUpdateRitualItem={actions.updateRitualItem}
          onClose={() => setShowSettings(false)}
          onShowWeekly={() => {
            setShowSettings(false);
            setWeekly(true);
          }}
        />
      )}
    </div>
  );
}
