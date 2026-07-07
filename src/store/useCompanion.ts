import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  appendEvent,
  isDriftEvent,
  loadEvents,
  phaseOf,
  tipFor,
  type DriftKind,
  type Phase,
} from './companion';
import type { useBloom } from './useBloom';

type Bloom = ReturnType<typeof useBloom>;

export type CompanionPromptState =
  | { type: 'checkin'; min: number }
  | { type: 'away'; min: number }
  | { type: 'triage'; min: number; src: 'checkin' | 'return' }
  | { type: 'tip'; kind: DriftKind; phase: Phase; text: string }
  | null;

const CHECKIN_AUTODISMISS_MS = 5000;
const TIP_AUTODISMISS_MS = 12000;

/**
 * Companion Mode — live behaviour. Owns the check-in schedule, tab-away
 * detection, the triage flow, and the pre-session intention. Renders nothing;
 * CompanionPrompt draws whatever `prompt` says.
 *
 * Tone contract: prompts only ever appear while the user is present and a
 * focus session is running; nothing interrupts them while away; an ignored
 * check-in is an answer ("not now") and suppresses the next one.
 */
export function useCompanion(bloom: Bloom) {
  const { state } = bloom;
  const conf = state.settings.companion;
  const focusRunning = state.running && state.mode === 'focus';
  const active = conf.on && focusRunning;

  const [prompt, setPrompt] = useState<CompanionPromptState>(null);
  const [intention, setIntention] = useState('');
  /** One warm line about the session that just finished, e.g. "2 focused · 1 drift". */
  const [summary, setSummary] = useState<string | null>(null);
  const sessionStartRef = useRef<number | null>(null);

  // Latest values for interval/event handlers without re-subscribing.
  const ref = useRef({ state, conf, prompt, active });
  ref.current = { state, conf, prompt, active };

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
    return Math.max(0, s.settings.durations[s.mode] - s.remaining);
  }, []);

  const sessionLenMins = useCallback(
    () => Math.max(1, Math.round(ref.current.state.settings.durations.focus / 60)),
    [],
  );

  const close = useCallback(() => {
    clearDismiss();
    setPrompt(null);
  }, []);

  /* ---------------- check-in schedule ---------------- */

  const nextAtRef = useRef(Infinity); // elapsed-seconds mark of the next check-in
  const skipNextRef = useRef(false); // set when a check-in was ignored
  const awayStartRef = useRef<number | null>(null); // set while tab/window is away

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
      setPrompt({ type: 'checkin', min });
      clearDismiss();
      dismissTimer.current = setTimeout(() => {
        // Ignored: counts as "not now", never nag twice in a row.
        appendEvent({
          ts: Date.now(),
          min,
          len: sessionLenMins(),
          kind: 'skip',
          src: 'checkin',
        });
        skipNextRef.current = true;
        setPrompt(null);
      }, CHECKIN_AUTODISMISS_MS);
    }, 1000);
    return () => clearInterval(iv);
  }, [active, conf.quiet, conf.checkinMins, elapsed, sessionLenMins]);

  /* ---------------- tab-away detection ---------------- */

  useEffect(() => {
    if (!conf.on || !conf.tabDetect) return;
    const goneAway = () => {
      if (ref.current.active && awayStartRef.current == null) {
        awayStartRef.current = Date.now();
      }
    };
    const cameBack = () => {
      const start = awayStartRef.current;
      awayStartRef.current = null;
      if (start == null || !ref.current.active) return;
      const awaySecs = (Date.now() - start) / 1000;
      if (awaySecs < ref.current.conf.awaySecs) return;
      const min = Math.floor(elapsed() / 60);
      if (ref.current.conf.quiet) {
        appendEvent({ ts: Date.now(), min, len: sessionLenMins(), kind: 'away', src: 'return' });
      } else if (!ref.current.prompt) {
        setPrompt({ type: 'away', min });
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
  }, [conf.on, conf.tabDetect, elapsed, sessionLenMins]);

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
    setSummary(
      drifts === 0
        ? `${focused} check-in${focused === 1 ? '' : 's'}, all focused ♡`
        : `${focused} focused · ${drifts} drift${drifts === 1 ? '' : 's'} — nice recovery ♡`,
    );
  }, [state.justDone, state.mode, conf.on]);

  /* ---------------- lifecycle tidying ---------------- */

  // Pausing or ending a session withdraws time-sensitive prompts (a tip may
  // stay — it's a keepsake, not a question). Session end clears the intention.
  useEffect(() => {
    if (!focusRunning) {
      setPrompt((p) => (p && p.type !== 'tip' ? null : p));
      clearDismiss();
    }
  }, [focusRunning]);

  useEffect(() => {
    if (state.justDone || state.mode !== 'focus') setIntention('');
  }, [state.justDone, state.mode]);

  useEffect(() => () => clearDismiss(), []);

  /* ---------------- answers ---------------- */

  const actions = useMemo(
    () => ({
      /** "yes, focused" on a check-in. */
      focused: () => {
        const p = ref.current.prompt;
        if (p?.type === 'checkin') {
          appendEvent({
            ts: Date.now(),
            min: p.min,
            len: sessionLenMins(),
            kind: 'focused',
            src: 'checkin',
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
        if (!p || p.type === 'triage' || p.type === 'tip') return;
        clearDismiss();
        skipNextRef.current = false;
        setPrompt({ type: 'triage', min: p.min, src: p.type === 'away' ? 'return' : 'checkin' });
      },
      /** Second tap: what kind of drift it was. */
      pick: (kind: DriftKind) => {
        const p = ref.current.prompt;
        if (p?.type !== 'triage') return;
        const len = sessionLenMins();
        appendEvent({ ts: Date.now(), min: p.min, len, kind, src: p.src });
        const phase = phaseOf(p.min, len);
        setPrompt({ type: 'tip', kind, phase, text: tipFor(kind, phase) });
        clearDismiss();
        dismissTimer.current = setTimeout(() => setPrompt(null), TIP_AUTODISMISS_MS);
      },
      /** "park it for later" inside a tip — becomes a task. */
      jot: (text: string) => {
        bloom.actions.addTask(text, 1);
      },
      close,
    }),
    [bloom.actions, close, sessionLenMins],
  );

  return {
    enabled: conf.on,
    conf,
    prompt,
    intention,
    setIntention,
    summary,
    actions,
  };
}

export type Companion = ReturnType<typeof useCompanion>;
