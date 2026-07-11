/**
 * Companion Mode — data layer.
 *
 * Types, defaults, the local event log, and the insights math. No React in
 * here; the live check-in behaviour lives in useCompanion.ts. Everything is
 * local-first: events persist under their own localStorage key, separate from
 * the main bloom state, so turning the mode off hides the UI without touching
 * the data.
 */

export interface CompanionSettings {
  /** Master toggle. Off = the app behaves exactly as without the feature. */
  on: boolean;
  /** Minutes between gentle check-ins inside a focus session. */
  checkinMins: number;
  /** Notice tab switches / window blur and say hi on return. */
  tabDetect: boolean;
  /** Seconds away before the return check-in triggers. */
  awaySecs: number;
  /** Log silently, never ask anything. */
  quiet: boolean;
  /** Offer the optional "what will you do?" field before a session. */
  intention: boolean;
}

export const DEFAULT_COMPANION: CompanionSettings = {
  on: false,
  checkinMins: 10,
  tabDetect: true,
  awaySecs: 30,
  quiet: false,
  intention: true,
};

/** Stepper choices for the sub-settings. */
export const CHECKIN_CHOICES = [3, 5, 10, 15, 20, 30];
export const AWAY_CHOICES = [15, 30, 60, 120];

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

/** Distraction taxonomy, loosely internal vs. external attention research. */
export type DriftKind = 'rabbit' | 'external' | 'urge' | 'wander' | 'restless';

export const DRIFT_KINDS: DriftKind[] = ['rabbit', 'external', 'urge', 'wander', 'restless'];

export interface CompanionEvent {
  /**
   * Unique id, stamped on append (PLAN 1.3). Optional because events logged
   * before linking existed have none — they stay valid, just unlinkable.
   */
  id?: string;
  /**
   * The session (SessionRecord/OpenSession id) this event happened inside,
   * if one was running. Old events and out-of-session events have none.
   */
  sessionId?: string;
  /** Epoch ms of the *answer* (or of logging, for silent/skip events). */
  ts: number;
  /**
   * Epoch ms the prompt appeared (PLAN 1.5). Together with `ts` this makes
   * time-to-answer analyzable. Optional: events logged before 1.5 (and silent
   * events with no prompt) have none.
   */
  shownAt?: number;
  /** Minute into the focus session when it happened (anchored to shownAt). */
  min: number;
  /**
   * User-estimated minute-into-session the drift *began* (PLAN 1.5) — a
   * self-reported guess, clamped to [last focused answer, min]. Drift onset,
   * not detection time, is the meaningful signal; stats prefer this over
   * `min` when present. Optional: only answered "since when?" steps have it.
   */
  estOnsetMin?: number;
  /** Session length in minutes (so phases stay meaningful across lengths). */
  len: number;
  /** Drift kind, or: focused answer / silent tab-away / ignored check-in. */
  kind: DriftKind | 'focused' | 'away' | 'skip';
  src: 'checkin' | 'return';
}

export const TRIAGE: { kind: DriftKind; label: string }[] = [
  { kind: 'rabbit', label: 'looked something up… then fell down a rabbit hole' },
  { kind: 'external', label: 'a notification or someone needed me' },
  { kind: 'urge', label: 'just felt the urge to check something' },
  { kind: 'wander', label: 'my mind wandered on its own' },
  { kind: 'restless', label: 'felt restless — couldn’t sit still' },
];

export const KIND_NAMES: Record<DriftKind, string> = {
  rabbit: 'rabbit holes',
  external: 'interruptions',
  urge: 'check-urges',
  wander: 'mind-wandering',
  restless: 'restlessness',
};

const LOG_KEY = 'bloom-companion-v1';
const MAX_EVENTS = 400;
const MAX_AGE_DAYS = 60;

export function loadEvents(): CompanionEvent[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const blob = JSON.parse(raw);
    return Array.isArray(blob?.events) ? (blob.events as CompanionEvent[]) : [];
  } catch {
    return [];
  }
}

let eventCounter = 0;

/** Unique-enough id for a local, single-user log (same style as session ids). */
export function newEventId(now = Date.now()): string {
  eventCounter = (eventCounter + 1) % 1000;
  return `e-${now.toString(36)}-${eventCounter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Append one event, stamping an id if it has none. Returns the stored event. */
export function appendEvent(e: CompanionEvent): CompanionEvent {
  const ev: CompanionEvent = { ...e, id: e.id ?? newEventId(e.ts) };
  const cutoff = ev.ts - MAX_AGE_DAYS * 86400000;
  const events = [...loadEvents().filter((x) => x.ts >= cutoff), ev].slice(-MAX_EVENTS);
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify({ version: 1, events }));
  } catch {
    /* storage unavailable — companion runs without memory */
  }
  return ev;
}

/**
 * Patch an already-stored event by id (PLAN 1.5) — used by the optional
 * "since when?" step, which lands after the drift itself was appended so an
 * unanswered step never loses the drift. No-op if the id isn't in the log.
 */
export function updateEvent(id: string, patch: Partial<CompanionEvent>): void {
  const events = loadEvents();
  const i = events.findIndex((e) => e.id === id);
  if (i === -1) return;
  events[i] = { ...events[i], ...patch };
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify({ version: 1, events }));
  } catch {
    /* storage unavailable — companion runs without memory */
  }
}

/**
 * The best available minute-into-session for when a drift *began*: the user's
 * own estimate when they gave one, else the detection minute (PLAN 1.5).
 */
export const driftOnsetMin = (e: CompanionEvent): number => e.estOnsetMin ?? e.min;

export function clearEvents() {
  try {
    localStorage.removeItem(LOG_KEY);
  } catch {
    /* nothing to clear */
  }
}

/* ------------------------------------------------------------------ *
 * Micro-interventions
 * ------------------------------------------------------------------ */

export type Phase = 'early' | 'mid' | 'late';

export function phaseOf(min: number, len: number): Phase {
  const rel = (min + 0.5) / Math.max(1, len);
  return rel < 0.34 ? 'early' : rel > 0.66 ? 'late' : 'mid';
}

/** One evidence-flavored, never-preachy tip per pattern. */
export function tipFor(kind: DriftKind, phase: Phase | null): string {
  switch (kind) {
    case 'rabbit':
      return 'try a “parking lot”: park the shiny thing on your list and visit it after the session.';
    case 'external':
      return 'pings love company — do-not-disturb during sessions, then answer them all in one batch.';
    case 'urge':
      return 'urge-surfing works: give it two minutes. most urges drift off on their own.';
    case 'wander':
      return phase === 'late'
        ? 'wandering late in a session is natural — a slightly shorter focus block might fit you better.'
        : 'before starting, try one line: “when I notice X, I’ll Y.” tiny plans catch wandering minds.';
    case 'restless':
      return 'a 30-second stretch or shake-out between sessions helps the wiggles settle.';
  }
}

/* ------------------------------------------------------------------ *
 * Insights
 * ------------------------------------------------------------------ */

export interface Insights {
  /** Answered check-ins in the last 7 days (focused + drifts). */
  answers: number;
  drifts: number;
  /** Silent tab-aways in the last 7 days. */
  aways: number;
  dominant: DriftKind | null;
  /** Where in the session drifting clusters, if it does. */
  phase: Phase | null;
  /** Time of day with the best focused ratio, if there's enough signal. */
  bestTime: string | null;
  tip: string | null;
  /** Show the gentle "everyone's attention differs" note. */
  gentleNote: boolean;
}

function timeBucket(ts: number): string {
  const h = new Date(ts).getHours();
  if (h >= 5 && h < 12) return 'mornings';
  if (h >= 12 && h < 17) return 'afternoons';
  if (h >= 17 && h < 22) return 'evenings';
  return 'nights';
}

/** Per-bucket focused/drift tallies over a set of events. */
function bucketStats(events: CompanionEvent[]): Map<string, { f: number; d: number }> {
  const buckets = new Map<string, { f: number; d: number }>();
  for (const e of events) {
    if (e.kind !== 'focused' && !isDriftEvent(e)) continue;
    const b = buckets.get(timeBucket(e.ts)) ?? { f: 0, d: 0 };
    if (e.kind === 'focused') b.f++;
    else b.d++;
    buckets.set(timeBucket(e.ts), b);
  }
  return buckets;
}

export const isDriftEvent = (e: CompanionEvent) => (DRIFT_KINDS as string[]).includes(e.kind);
const isDrift = isDriftEvent;

export function computeInsights(
  events: CompanionEvent[],
  now = Date.now(),
  windowDays = 7,
): Insights {
  const week = events.filter((e) => now - e.ts <= windowDays * 86400000);
  const drifts = week.filter(isDrift);
  const focused = week.filter((e) => e.kind === 'focused');
  const aways = week.filter((e) => e.kind === 'away');

  // Dominant drift type (needs a little data before it means anything).
  let dominant: DriftKind | null = null;
  if (drifts.length >= 3) {
    const counts = new Map<DriftKind, number>();
    for (const d of drifts) counts.set(d.kind as DriftKind, (counts.get(d.kind as DriftKind) ?? 0) + 1);
    dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  // Session phase where drifting clusters.
  let phase: Phase | null = null;
  if (drifts.length >= 3) {
    const byPhase = { early: 0, mid: 0, late: 0 };
    for (const d of drifts) byPhase[phaseOf(driftOnsetMin(d), d.len)]++;
    const top = (Object.entries(byPhase) as [Phase, number][]).sort((a, b) => b[1] - a[1])[0];
    if (top[1] > drifts.length / 2) phase = top[0];
  }

  // Best time of day by focused ratio, only for buckets with real samples.
  let bestTime: string | null = null;
  const buckets = bucketStats(week);
  let bestRatio = 0;
  for (const [name, b] of buckets) {
    const total = b.f + b.d;
    if (total < 3) continue;
    // "sharpest" needs at least one focused answer — a bucket that's all
    // drifts shouldn't win by default.
    const ratio = b.f / total;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestTime = name;
    }
  }

  const tip = dominant ? tipFor(dominant, phase) : null;

  // Gentle, non-diagnostic note: only when restlessness + internal urges
  // clearly dominate over a sustained stretch (not one rough afternoon).
  const allDrifts = events.filter(isDrift);
  const ru = allDrifts.filter((e) => e.kind === 'restless' || e.kind === 'urge');
  const spanDays = allDrifts.length
    ? (allDrifts[allDrifts.length - 1].ts - allDrifts[0].ts) / 86400000
    : 0;
  const gentleNote = ru.length >= 15 && spanDays >= 21 && ru.length / allDrifts.length >= 0.5;

  return {
    answers: focused.length + drifts.length,
    drifts: drifts.length,
    aways: aways.length,
    dominant,
    phase,
    bestTime,
    tip,
    gentleNote,
  };
}

/* ------------------------------------------------------------------ *
 * Attention recipe
 *
 * The personal layer on top of the raw patterns: a small set of concrete,
 * this-is-you recommendations built from the same local event log. Where the
 * patterns card says what happened, the recipe says what to try — tuned to
 * the person's own session length, drift style, and clock.
 * ------------------------------------------------------------------ */

export interface RecipeItem {
  /** Tiny pictogram for the row. */
  emoji: string;
  text: string;
}

/** Signals (answers + aways) needed before the recipe says anything. */
export const RECIPE_MIN_SIGNALS = 5;

/** How each drift style is best met — richer than the in-session micro-tips. */
const RECIPE_STRATEGY: Record<DriftKind, { emoji: string; text: string }> = {
  rabbit: {
    emoji: '🕳️',
    text: 'rabbit holes are your main pull — keep a "later list" beside you and park links there unopened; visit them in one batch after the timer.',
  },
  external: {
    emoji: '🔕',
    text: 'interruptions are your main pull — do-not-disturb during sessions, and tell people "back in a bit"; almost everything waits happily.',
  },
  urge: {
    emoji: '🌊',
    text: 'check-urges are your main pull — put the phone out of reach, and when an urge hits, surf it for two minutes; most fade on their own.',
  },
  wander: {
    emoji: '💭',
    text: 'mind-wandering is your main pull — write one tiny intention before each session and re-read the last line whenever you notice drifting.',
  },
  restless: {
    emoji: '🐇',
    text: 'restlessness is your main pull — move every break (stretch, shake-out, a lap of the room) so the wiggles are spent before you sit back down.',
  },
};

/**
 * Build the personal attention recipe from the event log. Returns [] until
 * there are at least RECIPE_MIN_SIGNALS signals in the window; callers show a
 * "still learning you" line instead. Capped at 4 rows so it stays a recipe,
 * not a lecture.
 */
export function computeAttentionPlan(
  events: CompanionEvent[],
  focusLenMins: number,
  now = Date.now(),
  windowDays = 28,
): RecipeItem[] {
  const window = events.filter((e) => now - e.ts <= windowDays * 86400000);
  const drifts = window.filter(isDriftEvent);
  const focused = window.filter((e) => e.kind === 'focused');
  const aways = window.filter((e) => e.kind === 'away');
  if (focused.length + drifts.length + aways.length < RECIPE_MIN_SIGNALS) return [];

  const items: RecipeItem[] = [];
  const answers = focused.length + drifts.length;
  const driftRate = answers > 0 ? drifts.length / answers : 0;

  // 1) Session length, fit to where attention actually bends.
  if (drifts.length >= 3) {
    const late = drifts.filter((d) => phaseOf(driftOnsetMin(d), d.len) === 'late');
    if (late.length > drifts.length / 2 && focusLenMins >= 20) {
      const shorter = Math.max(15, focusLenMins - 5);
      items.push({
        emoji: '⏱️',
        text: `your focus tends to fade near the end — try ${shorter}-minute sessions for a week; ending strong beats lasting long.`,
      });
    } else if (
      drifts.filter((d) => phaseOf(driftOnsetMin(d), d.len) === 'early').length >
      drifts.length / 2
    ) {
      items.push({
        emoji: '🚀',
        text: 'drifts cluster right after you start — a 30-second warm-up (clear desk, one intention, water) helps you land in the session.',
      });
    }
  } else if (answers >= 8 && driftRate < 0.15 && focusLenMins <= 30) {
    items.push({
      emoji: '📈',
      text: `you hold focus really well — you could stretch sessions to ${focusLenMins + 5} minutes and sink into deeper work.`,
    });
  }

  // 2) The clock: guard the strong hours, spare the weak ones.
  const buckets = bucketStats(window);
  let best: { name: string; ratio: number } | null = null;
  let worst: { name: string; ratio: number } | null = null;
  for (const [name, b] of buckets) {
    const total = b.f + b.d;
    if (total < 3 || b.f === 0) {
      if (total >= 3 && b.f === 0) worst = { name, ratio: 0 };
      continue;
    }
    const ratio = b.f / total;
    if (!best || ratio > best.ratio) best = { name, ratio };
    if (!worst || ratio < worst.ratio) worst = { name, ratio };
  }
  if (best && best.ratio >= 0.6) {
    items.push({
      emoji: '🌤️',
      text: `${best.name} are your golden hours — give them your hardest task, before anything else gets a turn.`,
    });
  }
  if (worst && best && worst.name !== best.name && worst.ratio <= 0.45) {
    items.push({
      emoji: '🌙',
      text: `${worst.name} run foggier for you — save easy wins (tidying notes, small errands) for then instead of the big stuff.`,
    });
  }

  // 3) Their dominant drift style, met with a matching strategy.
  if (drifts.length >= 3) {
    const counts = new Map<DriftKind, number>();
    for (const d of drifts) counts.set(d.kind as DriftKind, (counts.get(d.kind as DriftKind) ?? 0) + 1);
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    items.push(RECIPE_STRATEGY[dominant]);
  }

  // 4) Quiet tab-aways: the drift that never gets asked about.
  if (aways.length >= 3 && aways.length >= answers * 0.5) {
    items.push({
      emoji: '🖥️',
      text: 'the tab pulls you away a lot — try fullscreen or a separate desktop for sessions so elsewhere is a real trip, not one flick.',
    });
  }

  return items.slice(0, 4);
}
