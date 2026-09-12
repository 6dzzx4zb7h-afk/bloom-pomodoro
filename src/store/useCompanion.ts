import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { preSlumpSuggestion } from '../insights/triggers';
import {
  appendDriftEvent,
  appendEvent,
  isDriftEvent,
  loadEvents,
  phaseOf,
  tipFor,
  updateEvent,
  type DriftKind,
  type Phase,
} from './companion';
import type { TimerMode, useBloom } from './useBloom';
import { RETURN_GAP_MIN_SEC } from './sessions';

type Bloom = ReturnType<typeof useBloom>;

export type CompanionPromptState =
  | { type: 'checkin'; min: number; shownAt: number; sessionId?: string }
  | { type: 'away'; min: number; shownAt: number }
  | {
      type: 'triage';
      min: number;
      shownAt: number;
      src: 'checkin' | 'return' | 'repair';
      eventId: string;
    }
  | { type: 'onset'; min: number; shownAt: number; kind: DriftKind; eventId?: string }
  | { type: 'tip'; kind: DriftKind; phase: Phase; text: string }
  | { type: 'preSlump'; typicalFirstDriftMin: number; cueMin: number }
  | null;

// The 5.3 reset offer may wait for one calm choice, but it never becomes an
// always-on nudge: it withdraws after the reset's one-minute ceiling. Choosing
// the breath clears this timer immediately via actions.hold().
const TIP_AUTODISMISS_MS = 60_000;
const PRE_SLUMP_AUTODISMISS_MS = 12000;

/**
 * Honest-return snapshots belong to countdown work. Flow deliberately stays
 * excluded: it counts elapsed time upward, has no countdown gap to classify,
 * and its separate openFlow record must remain banked across app visibility.
 */
export const tracksCompanionTabReturn = (mode: TimerMode): boolean =>
  mode === 'focus' || mode === 'tiny';

/** One neutral, factual end-of-session line. */
export function formatCompanionSummary(focused: number, drifts: number): string | null {
  if (focused + drifts === 0) return null;
  if (drifts === 0) {
    return `${focused} focused check-in${focused === 1 ? '' : 's'}, noted ♡`;
  }
  return `${focused} focused · ${drifts} drift${drifts === 1 ? '' : 's'}, noted ♡`;
}

/**
 * Companion Mode — live behaviour. Owns the check-in schedule, tab-away
 * detection, the triage flow, and the separately
 * opt-in pre-slump cue. Renders nothing; CompanionPrompt draws `prompt`.
 *
 * Tone contract: prompts only ever appear while the user is present and a
 * focus session is running; nothing interrupts them while away. The check-in
 * waits patiently (small, non-blocking) until answered while the user is
 * present (PLAN 1.5a); pause, session end, or going away withdraws it as an
 * unanswered 'skip', which still suppresses the next one.
 */
export function useCompanion(bloom: Bloom) {
  const { state } = bloom;
  const conf = state.settings.companion;
  const focusRunning = state.running && state.mode === 'focus';
  const returnTrackingRunning = state.running && tracksCompanionTabReturn(state.mode);
  const active = conf.on && focusRunning;
  const returnTrackingActive = conf.on && returnTrackingRunning;

  const [prompt, setPrompt] = useState<CompanionPromptState>(null);
  /** One warm line about the session that just finished, e.g. "2 focused · 1 drift". */
  const [summary, setSummary] = useState<string | null>(null);
  const sessionStartRef = useRef<number | null>(null);
  // A button can be activated twice before React commits the prompt/state
  // transition. Claim the exact prompt/snapshot object synchronously so one
  // honest "I drifted" answer can append and link at most one event.
  const claimedDriftDecisionsRef = useRef(new WeakSet<object>());
  const skippedCheckinsRef = useRef(new WeakSet<object>());

  // Latest values for interval/event handlers without re-subscribing.
  const ref = useRef({ state, conf, prompt, active, returnTrackingActive });
  ref.current = { state, conf, prompt, active, returnTrackingActive };

  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearDismiss = () => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = null;
  };

  /** Seconds elapsed in the current session. */
  const elapsed = useCallback(() => {
    const s = ref.current.state;
    // Flow counts up, so `remaining` already is the elapsed time. (Companion
    // check-ins only arm for classic focus, but keep the math honest anyway.)
    if (s.mode === 'flow') return Math.max(0, s.remaining);
    if (s.mode === 'tiny') {
      return Math.max(0, (s.openFocus?.plannedMin ?? 0) * 60 - s.remaining);
    }
    return Math.max(0, s.settings.durations[s.mode] - s.remaining);
  }, []);

  const sessionLenMins = useCallback(() => {
    const current = ref.current.state;
    if (
      (current.mode === 'focus' || current.mode === 'tiny') &&
      current.openFocus?.plannedMin != null
    ) {
      return Math.max(1, current.openFocus.plannedMin);
    }
    return Math.max(1, Math.round(current.settings.durations.focus / 60));
  }, []);

  const close = useCallback(() => {
    clearDismiss();
    setPrompt(null);
  }, []);

  /** Id of the focus session currently underway, if any (PLAN 1.3). */
  const activeSessionId = useCallback(() => ref.current.state.openFocus?.id, []);

  /* ---------------- check-in schedule ---------------- */

  const nextAtRef = useRef(Infinity); // elapsed-seconds mark of the next check-in
  const skipNextRef = useRef(false); // set when a check-in was ignored
  const awayStartRef = useRef<number | null>(null); // set while tab/window is away

  /**
   * A withdrawn-unanswered check-in is an answer ("not now"): log it as
   * 'skip' and keep the never-two-in-a-row rule (PLAN 1.5a). The sessionId
   * captured at show time keeps the link even when the session just ended.
   */
  const logSkip = useCallback(
    (p: { min: number; shownAt: number; sessionId?: string }) => {
      if (skippedCheckinsRef.current.has(p)) return;
      skippedCheckinsRef.current.add(p);
      appendEvent({
        ts: Date.now(),
        shownAt: p.shownAt,
        min: p.min,
        len: sessionLenMins(),
        kind: 'skip',
        src: 'checkin',
        sessionId: p.sessionId,
      });
      skipNextRef.current = true;
    },
    [sessionLenMins],
  );

  useEffect(() => {
    if (!active || conf.quiet) {
      nextAtRef.current = Infinity;
      return;
    }
    // (Re)arm the schedule from wherever the session currently is — covers
    // start, resume after pause, and mid-session settings changes.
    // Dev shortcut: `localStorage['bloom-companion-fast']='1'` makes the
    // interval run in seconds instead of minutes, for trying it out.
    const fast = localStorage.getItem('bloom-companion-fast') === '1';
    const interval = conf.checkinMins * (fast ? 1 : 60);
    nextAtRef.current = elapsed() + interval;

    const iv = setInterval(() => {
      const cur = ref.current;
      if (!cur.active || cur.conf.quiet || cur.prompt) return;
      // Never pop while they're away — hidden tab or blurred window alike.
      if (document.hidden || awayStartRef.current != null) return;
      if (elapsed() < nextAtRef.current) return;
      // Re-base rather than += so a long quiet stretch (hidden tab, open
      // prompt) never queues a burst of back-to-back check-ins afterwards.
      nextAtRef.current = elapsed() + interval;
      if (skipNextRef.current) {
        // Last one was ignored — let this cycle pass in silence.
        skipNextRef.current = false;
        return;
      }
      const min = Math.floor(elapsed() / 60);
      // No auto-dismiss (PLAN 1.5a): the prompt stays, small and
      // non-blocking, until answered — or is withdrawn as 'skip' by
      // pause/end/tab-away below.
      clearDismiss();
      setPrompt({ type: 'checkin', min, shownAt: Date.now(), sessionId: activeSessionId() });
    }, 1000);
    return () => clearInterval(iv);
  }, [active, conf.quiet, conf.checkinMins, elapsed, sessionLenMins, activeSessionId]);

  // If Companion is switched off or made quiet while its check-in is open,
  // withdraw that unanswered question immediately. Pauses/ends are handled by
  // the lifecycle effect below, so this path cannot double-log the skip.
  useEffect(() => {
    if (!focusRunning || (conf.on && !conf.quiet)) return;
    const p = ref.current.prompt;
    if (p?.type !== 'checkin' && p?.type !== 'preSlump') return;
    if (p.type === 'checkin') logSkip(p);
    clearDismiss();
    setPrompt(null);
  }, [focusRunning, conf.on, conf.quiet, logSkip]);

  /* ---------------- pre-slump gentle check ---------------- */

  useEffect(() => {
    if (!focusRunning || !conf.on || conf.quiet || !state.settings.preSlumpCheck) return;

    // History is sampled once at session start. Crossing the signal threshold
    // mid-session waits until the next session rather than creating a surprise.
    const events = loadEvents();
    const fast = localStorage.getItem('bloom-companion-fast') === '1';
    const maybeShow = () => {
      const cur = ref.current;
      if (
        !cur.state.running ||
        cur.state.mode !== 'focus' ||
        !cur.state.settings.preSlumpCheck ||
        cur.prompt ||
        document.hidden ||
        awayStartRef.current != null
      ) {
        return;
      }
      const sessionId = cur.state.openFocus?.id ?? null;
      const at = Date.now();
      const suggestion = preSlumpSuggestion({
        optedIn: cur.state.settings.preSlumpCheck,
        sessionId,
        // Existing local preview shortcut: minutes become seconds only when
        // explicitly enabled in devtools, keeping production timing unchanged.
        elapsedMin: elapsed() / (fast ? 1 : 60),
        records: cur.state.sessionRecords,
        events,
        caps: cur.state.preSlump,
        now: at,
        studyDayKey: cur.state.today,
      });
      if (!suggestion || !sessionId) return;

      bloom.actions.recordPreSlump(sessionId, at);
      clearDismiss();
      setPrompt({
        type: 'preSlump',
        typicalFirstDriftMin: suggestion.typicalFirstDriftMin,
        cueMin: suggestion.cueMin,
      });
      dismissTimer.current = setTimeout(
        () => setPrompt((current) => (current?.type === 'preSlump' ? null : current)),
        PRE_SLUMP_AUTODISMISS_MS,
      );
    };

    maybeShow();
    const interval = setInterval(maybeShow, 1000);
    return () => clearInterval(interval);
  }, [
    focusRunning,
    conf.on,
    conf.quiet,
    state.settings.preSlumpCheck,
    state.openFocus?.id,
    elapsed,
    bloom.actions,
  ]);

  // Going away (hidden tab or blurred window) withdraws an unanswered
  // check-in as a skip — independent of the tabDetect toggle (PLAN 1.5a).
  useEffect(() => {
    const withdraw = () => {
      const p = ref.current.prompt;
      if (p?.type === 'checkin') logSkip(p);
      if (p?.type === 'checkin' || p?.type === 'preSlump') {
        clearDismiss();
        setPrompt(null);
      }
    };
    const onVis = () => {
      if (document.hidden) withdraw();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', withdraw);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', withdraw);
    };
  }, [logSkip]);

  /* ---------------- tab-away detection ---------------- */

  useEffect(() => {
    if (!conf.on || !conf.tabDetect) return;
    const goneAway = () => {
      if (ref.current.returnTrackingActive && awayStartRef.current == null) {
        const at = Date.now();
        awayStartRef.current = at;
        // Quiet Mode promises never to ask. Otherwise capture the timer now,
        // before the background tab can be throttled (PLAN 5.2).
        if (!ref.current.conf.quiet) bloom.actions.captureTabLeave(at);
      }
    };
    const cameBack = () => {
      const start = awayStartRef.current;
      awayStartRef.current = null;
      if (start == null || !ref.current.returnTrackingActive) return;
      const awaySecs = (Date.now() - start) / 1000;
      if (ref.current.conf.quiet) {
        if (awaySecs < ref.current.conf.awaySecs) return;
        const min = Math.floor(elapsed() / 60);
        // A silent tab-away is a drift too: stamp and link it (PLAN 1.3).
        const sessionId = activeSessionId();
        const ev = appendEvent({
          ts: Date.now(),
          min,
          len: sessionLenMins(),
          kind: 'away',
          src: 'return',
          sessionId,
        });
        if (sessionId && ev.id) bloom.actions.linkDriftEvent(ev.id, sessionId);
      } else {
        // Honest return always has a 45-second floor. Existing settings can
        // make it quieter, never more eager than the plan's blip guard.
        bloom.actions.markTabReturn(
          Date.now(),
          Math.max(RETURN_GAP_MIN_SEC, ref.current.conf.awaySecs),
        );
      }
    };
    const onVis = () => (document.hidden ? goneAway() : cameBack());
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', goneAway);
    window.addEventListener('focus', cameBack);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', goneAway);
      window.removeEventListener('focus', cameBack);
    };
  }, [conf.on, conf.tabDetect, elapsed, sessionLenMins, activeSessionId, bloom.actions]);

  /* ---------------- end-of-session summary ---------------- */

  // Remember when the running focus session started (works across pauses:
  // start = now - elapsed). A fresh session clears the previous summary.
  useEffect(() => {
    if (active) {
      sessionStartRef.current = Date.now() - elapsed() * 1000;
      setSummary(null);
    }
  }, [active, elapsed]);

  // When a focus session completes, sum up its check-ins into one warm line.
  useEffect(() => {
    if (!state.justDone || state.mode !== 'focus' || !conf.on) return;
    const start = sessionStartRef.current;
    if (start == null) return;
    const evs = loadEvents().filter((e) => e.ts >= start);
    const focused = evs.filter((e) => e.kind === 'focused').length;
    const drifts = evs.filter(isDriftEvent).length;
    if (focused + drifts === 0) return;
    setSummary(formatCompanionSummary(focused, drifts));
  }, [state.justDone, state.mode, conf.on]);

  /* ---------------- lifecycle tidying ---------------- */

  // Pausing or ending a session withdraws time-sensitive prompts (a tip may
  // stay — it's a keepsake, not a question). A check-in that was still
  // waiting logs as an unanswered 'skip' (PLAN 1.5a). Session end clears the
  // current prompt.
  useEffect(() => {
    if (!focusRunning) {
      const p = ref.current.prompt;
      if (p?.type === 'checkin') logSkip(p);
      setPrompt((q) => (q && q.type !== 'tip' ? null : q));
      clearDismiss();
    }
  }, [focusRunning, logSkip]);

  useEffect(() => () => clearDismiss(), []);

  /* ---------------- answers ---------------- */

  const actions = useMemo(
    () => ({
      /** Dismiss without asserting focus or drift; leave the next interval quiet. */
      skipCheckin: () => {
        const p = ref.current.prompt;
        if (p?.type !== 'checkin') return;
        logSkip(p);
        close();
      },
      /** "yes, focused" on a check-in. */
      focused: () => {
        const p = ref.current.prompt;
        if (p?.type === 'checkin') {
          appendEvent({
            ts: Date.now(),
            shownAt: p.shownAt,
            min: p.min,
            len: sessionLenMins(),
            kind: 'focused',
            src: 'checkin',
            sessionId: activeSessionId(),
          });
        }
        skipNextRef.current = false;
        close();
      },
      /** "yep, on purpose" on a welcome-back — noted, not logged. */
      onPurpose: () => close(),
      /** "i drifted" — open the two-tap triage. */
      drifted: () => {
        const p = ref.current.prompt;
        if (p?.type !== 'checkin' && p?.type !== 'away') return;
        if (claimedDriftDecisionsRef.current.has(p)) return;
        claimedDriftDecisionsRef.current.add(p);
        const sessionId = p.type === 'checkin' ? p.sessionId ?? activeSessionId() : activeSessionId();
        const ev = appendDriftEvent({
          ts: Date.now(),
          shownAt: p.shownAt,
          min: p.min,
          len: sessionLenMins(),
          src: p.type === 'away' ? 'return' : 'checkin',
          sessionId,
        });
        if (sessionId && ev.id) bloom.actions.linkDriftEvent(ev.id, sessionId);
        clearDismiss();
        skipNextRef.current = false;
        setPrompt({
          type: 'triage',
          min: p.min,
          shownAt: p.shownAt,
          src: p.type === 'away' ? 'return' : 'checkin',
          eventId: ev.id,
        });
      },
      /** Honest tab-return answer: preserve one normal triage, then catch up. */
      returnDrifted: () => {
        const snapshot = ref.current.state.openFocus?.returnSnapshot;
        if (!snapshot?.returnedAt) return;
        if (claimedDriftDecisionsRef.current.has(snapshot)) return;
        claimedDriftDecisionsRef.current.add(snapshot);
        const len = sessionLenMins();
        const gapSec = Math.max(0, (snapshot.returnedAt - snapshot.capturedAt) / 1000);
        const min = Math.floor(Math.min(len * 60, snapshot.elapsedSec + gapSec) / 60);
        const sessionId = activeSessionId();
        const ev = appendDriftEvent({
          ts: Date.now(),
          shownAt: snapshot.returnedAt,
          min,
          len,
          src: 'return',
          sessionId,
        });
        if (sessionId && ev.id) bloom.actions.linkDriftEvent(ev.id, sessionId);
        clearDismiss();
        setPrompt({
          type: 'triage',
          min,
          shownAt: snapshot.returnedAt,
          src: 'return',
          eventId: ev.id,
        });
        bloom.actions.resolveTabReturn('drifted');
      },
      /** Second tap: what kind of drift it was. */
      pick: (kind: DriftKind) => {
        const p = ref.current.prompt;
        if (p?.type !== 'triage') return;
        // The answer was persisted and linked before triage opened. Classify
        // that same record rather than appending a second drift.
        updateEvent(p.eventId, { kind });
        // The optional "since when?" step (PLAN 1.5c) only patches an
        // estimate onto it, so skipping loses nothing.
        clearDismiss();
        setPrompt({ type: 'onset', min: p.min, shownAt: p.shownAt, kind, eventId: p.eventId });
      },
      /**
       * Optional third tap: the user's own guess of when the drift began,
       * given as "minutes ago" (null = no guess). Clamped so the estimate
       * never lands before the last focused answer in this session — or
       * before minute 0 — and never after the check-in itself (PLAN 1.5c).
       */
      estOnset: (minsAgo: number | null) => {
        const p = ref.current.prompt;
        if (p?.type !== 'onset') return;
        const len = sessionLenMins();
        let onset: number | null = null;
        if (minsAgo != null) {
          const sid = activeSessionId();
          const floor = sid
            ? loadEvents()
                .filter((e) => e.sessionId === sid && e.kind === 'focused')
                .reduce((m, e) => Math.max(m, e.min), 0)
            : 0;
          onset = Math.min(p.min, Math.max(floor, p.min - Math.max(0, Math.round(minsAgo))));
          if (p.eventId) updateEvent(p.eventId, { estOnsetMin: onset });
        }
        const phase = phaseOf(onset ?? p.min, len);
        setPrompt({ type: 'tip', kind: p.kind, phase, text: tipFor(p.kind, phase) });
        clearDismiss();
        dismissTimer.current = setTimeout(() => setPrompt(null), TIP_AUTODISMISS_MS);
      },
      /** "park it for later" inside a tip — hidden until the session pauses. */
      jot: (text: string) => {
        bloom.actions.parkThought(text);
      },
      /** Keep a chosen kind restart open beyond the old short tip timeout. */
      hold: () => clearDismiss(),
      /** The active record already persists this cue for PLAN 5.2. */
      nextAction: () => ref.current.state.openFocus?.nextActionText ?? '',
      resumeWith: (nextStep: string) => {
        const sessionId = activeSessionId();
        if (sessionId) bloom.actions.setNextAction(sessionId, nextStep);
        close();
      },
      /** One tap keeps every remaining pre-slump cue quiet for this local day. */
      silencePreSlumpForDay: () => {
        if (ref.current.prompt?.type !== 'preSlump') return;
        bloom.actions.silencePreSlumpForDay(Date.now());
        close();
      },
      close,
    }),
    [bloom.actions, close, sessionLenMins, activeSessionId, logSkip],
  );

  return {
    enabled: conf.on,
    conf,
    prompt,
    summary,
    actions,
  };
}

export type Companion = ReturnType<typeof useCompanion>;
