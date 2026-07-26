/**
 * Companion Mode — data layer.
 *
 * Types, defaults, the local event log, and the insights math. No React in
 * here; the live check-in behaviour lives in useCompanion.ts. Everything is
 * local-first: events persist under their own localStorage key, separate from
 * the main bloom state, so turning the mode off hides the UI without touching
 * the data.
 */

// Type-only (erased at compile time, so no runtime cycle with why.ts, which
// imports helpers from this file): the shared evidence vocabulary (PLAN 2.4).
import type { EvidenceKey } from '../insights/why';

/** A gentle self-description, never a diagnosis or a fixed identity. */
export type Chronotype = 'betterEarlier' | 'betterLater' | 'notSure';

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
  /**
   * Drift kind, an unclassified drift answer, or: focused answer / silent
   * tab-away / ignored check-in. `drift` is persisted before optional triage,
   * so skipping that follow-up (or closing the app) never loses the answer.
   */
  kind: DriftKind | 'drift' | 'focused' | 'away' | 'skip';
  src: 'checkin' | 'return';
}

export type StoredCompanionEvent = CompanionEvent & { id: string };

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

export const COMPANION_STORAGE_KEY = 'bloom-companion-v1';
export const COMPANION_LOG_VERSION = 2;
export const COMPANION_EVENT_CAP = 400;
const LOG_KEY = COMPANION_STORAGE_KEY;
const LOG_VERSION = COMPANION_LOG_VERSION;
const MAX_EVENTS = COMPANION_EVENT_CAP;
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
export function appendEvent(e: CompanionEvent): StoredCompanionEvent {
  const ev: StoredCompanionEvent = { ...e, id: e.id ?? newEventId(e.ts) };
  const cutoff = ev.ts - MAX_AGE_DAYS * 86400000;
  const events = [...loadEvents().filter((x) => x.ts >= cutoff), ev].slice(-MAX_EVENTS);
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify({ version: LOG_VERSION, events }));
  } catch {
    /* storage unavailable — companion runs without memory */
  }
  return ev;
}

/**
 * Persist the first, meaningful "I drifted" answer before asking why. The
 * returned id is subsequently patched with the optional triage choice; it is
 * never replaced by a second event.
 */
export function appendDriftEvent(e: Omit<CompanionEvent, 'kind'>): StoredCompanionEvent {
  return appendEvent({ ...e, kind: 'drift' });
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
    localStorage.setItem(LOG_KEY, JSON.stringify({ version: LOG_VERSION, events }));
  } catch {
    /* storage unavailable — companion runs without memory */
  }
}

/**
 * The best available minute-into-session for when a drift *began*: the user's
 * own estimate when they gave one, else the detection minute (PLAN 1.5).
 * Imported or historically malformed values are clamped to the event's
 * observable session window before analytics can classify them (PLAN 8.19).
 */
export function driftOnsetMin(e: CompanionEvent, floor = 0): number {
  const len = Number.isFinite(e.len) ? Math.max(0, e.len) : 0;
  const detected = Number.isFinite(e.min) ? Math.min(len, Math.max(0, e.min)) : 0;
  const lower = Math.min(detected, Math.max(0, floor));
  const estimated = Number.isFinite(e.estOnsetMin) ? e.estOnsetMin! : detected;
  return Math.min(detected, Math.max(lower, estimated));
}

/** When the check-in occurred; `ts` remains answer/log latency only. */
export function companionEventOccurredAt(e: CompanionEvent): number {
  return e.shownAt ?? e.ts;
}

/**
 * Quarantine impossible/future event timestamps and normalize timing fields
 * before any selector derives a user-facing pattern.
 *
 * Sorting by occurrence time lets a prior focused answer become the lower
 * bound for a later estimated drift onset in the same session. The returned
 * values are copies; the immutable local event log is never rewritten.
 */
export function companionEventsForAnalytics(
  events: CompanionEvent[],
  now = Date.now(),
): CompanionEvent[] {
  if (!Number.isFinite(now) || now < 0) return [];

  const valid = events
    .filter((event) => {
      const occurredAt = companionEventOccurredAt(event);
      return (
        Number.isFinite(event.ts) &&
        event.ts >= 0 &&
        event.ts <= now &&
        Number.isFinite(occurredAt) &&
        occurredAt >= 0 &&
        occurredAt <= event.ts &&
        Number.isFinite(event.min) &&
        Number.isFinite(event.len) &&
        event.len > 0
      );
    })
    .sort(
      (a, b) =>
        companionEventOccurredAt(a) - companionEventOccurredAt(b) ||
        a.ts - b.ts ||
        (a.id ?? '').localeCompare(b.id ?? ''),
    );

  const lastFocusedMinBySession = new Map<string, number>();
  return valid.map((event) => {
    const len = Math.max(1, event.len);
    const min = Math.min(len, Math.max(0, event.min));
    const floor = event.sessionId
      ? (lastFocusedMinBySession.get(event.sessionId) ?? 0)
      : 0;
    const normalized: CompanionEvent = {
      ...event,
      min,
      len,
      ...(isDriftEvent(event) && (event.estOnsetMin !== undefined || floor > 0)
        ? { estOnsetMin: driftOnsetMin({ ...event, min, len }, floor) }
        : {}),
    };
    if (event.kind === 'focused' && event.sessionId) {
      lastFocusedMinBySession.set(
        event.sessionId,
        Math.max(floor, min),
      );
    }
    return normalized;
  });
}

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
      return 'try giving the urge two minutes before deciding what to do with it.';
    case 'wander':
      return phase === 'late'
        ? 'wandering late in a session is natural — a slightly shorter focus block might fit you better.'
        : 'before starting, try one line: “when I notice X, I’ll Y.” tiny plans catch wandering minds.';
    case 'restless':
      return 'a 30-second stretch or shake-out between sessions can give restlessness somewhere to go.';
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

type TimeBucket = 'mornings' | 'afternoons' | 'evenings' | 'nights';

function timeBucketForHour(h: number): TimeBucket {
  if (h >= 5 && h < 12) return 'mornings';
  if (h >= 12 && h < 17) return 'afternoons';
  if (h >= 17 && h < 22) return 'evenings';
  return 'nights';
}

function timeBucket(ts: number): TimeBucket {
  return timeBucketForHour(new Date(ts).getHours());
}

/** Per-bucket focused/drift tallies over a set of events. */
function bucketStats(events: CompanionEvent[]): Map<string, { f: number; d: number }> {
  const buckets = new Map<string, { f: number; d: number }>();
  for (const e of events) {
    if (e.kind !== 'focused' && !isDriftEvent(e)) continue;
    const occurredAt = companionEventOccurredAt(e);
    const b = buckets.get(timeBucket(occurredAt)) ?? { f: 0, d: 0 };
    if (e.kind === 'focused') b.f++;
    else b.d++;
    buckets.set(timeBucket(occurredAt), b);
  }
  return buckets;
}

/** A drift with an answered cause; safe to use for kind-specific claims. */
export const isClassifiedDriftEvent = (
  e: CompanionEvent,
): e is CompanionEvent & { kind: DriftKind } => (DRIFT_KINDS as string[]).includes(e.kind);

/** Any explicit drift answer, including one whose optional triage was skipped. */
export const isDriftEvent = (
  e: CompanionEvent,
): e is CompanionEvent & { kind: DriftKind | 'drift' } =>
  e.kind === 'drift' || isClassifiedDriftEvent(e);
const isDrift = isDriftEvent;

export function computeInsights(
  events: CompanionEvent[],
  now = Date.now(),
  windowDays = 7,
): Insights {
  const normalized = companionEventsForAnalytics(events, now);
  const week = normalized.filter(
    (e) => now - companionEventOccurredAt(e) <= windowDays * 86400000,
  );
  const drifts = week.filter(isDrift);
  const classifiedDrifts = drifts.filter(isClassifiedDriftEvent);
  const focused = week.filter((e) => e.kind === 'focused');
  const aways = week.filter((e) => e.kind === 'away');

  // Dominant drift type (needs a little data before it means anything).
  let dominant: DriftKind | null = null;
  if (classifiedDrifts.length >= 3) {
    const counts = new Map<DriftKind, number>();
    for (const d of classifiedDrifts) counts.set(d.kind, (counts.get(d.kind) ?? 0) + 1);
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
  const allClassifiedDrifts = normalized.filter(isClassifiedDriftEvent);
  const ru = allClassifiedDrifts.filter((e) => e.kind === 'restless' || e.kind === 'urge');
  const spanDays = allClassifiedDrifts.length
    ? (
        companionEventOccurredAt(allClassifiedDrifts[allClassifiedDrifts.length - 1]) -
        companionEventOccurredAt(allClassifiedDrifts[0])
      ) / 86400000
    : 0;
  const gentleNote =
    ru.length >= 15 &&
    spanDays >= 21 &&
    ru.length / allClassifiedDrifts.length >= 0.5;

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
  /**
   * The user's own numbers behind this line (PLAN 2.4) — no recommendation
   * appears without one. Rendered under the suggestion, next to "why?".
   */
  because: string;
  /**
   * Which piece of the evidence base backs the line — shared vocabulary with
   * the debrief why-engine; resolves via WHY_EVIDENCE_ANCHORS / the explainer
   * sheet today, and deep-links into the Field Guide after 6.3.
   */
  evidenceKey: EvidenceKey;
}

/** Signals (answers + aways) needed before the recipe says anything. */
export const RECIPE_MIN_SIGNALS = 5;

/** The subset of completionRateByStartHour() consumed by the recipe. */
export interface StartHourCompletion {
  hour: number;
  total: number;
  completed: number;
  rate: number;
}

export interface AttentionPlanContext {
  chronotype: Chronotype;
  completionByStartHour: StartHourCompletion[];
}

const CHRONOTYPE_LABEL: Record<Chronotype, string> = {
  betterEarlier: 'better earlier',
  betterLater: 'better later',
  notSure: 'not sure yet',
};

const TIME_BUCKET_PHRASE: Record<TimeBucket, string> = {
  mornings: 'morning',
  afternoons: 'afternoon',
  evenings: 'evening',
  nights: 'night',
};

/**
 * A two-session prior gently breaks close calls while observed completions
 * stay in charge as the log grows. `notSure` is neutral in every bucket.
 */
function chronotypePrior(chronotype: Chronotype, bucket: TimeBucket): number {
  if (chronotype === 'notSure') return 0.5;
  if (chronotype === 'betterEarlier') {
    return { mornings: 0.8, afternoons: 0.6, evenings: 0.35, nights: 0.25 }[bucket];
  }
  return { mornings: 0.25, afternoons: 0.4, evenings: 0.8, nights: 0.6 }[bucket];
}

/** How each drift style is best met — richer than the in-session micro-tips. */
const RECIPE_STRATEGY: Record<DriftKind, { emoji: string; text: string; evidenceKey: EvidenceKey }> = {
  rabbit: {
    emoji: '🕳️',
    text: 'rabbit holes have shown up most often lately — a "later list" could hold links unopened until one batch after the timer.',
    evidenceKey: 'parking-lot',
  },
  external: {
    emoji: '🔕',
    text: 'interruptions have shown up most often lately — want to try do-not-disturb and a quick "back in a bit" when that fits?',
    evidenceKey: 'desk-help',
  },
  urge: {
    emoji: '🌊',
    text: 'check-urges have shown up most often lately — worth an experiment: phone out of reach, then two minutes before deciding.',
    evidenceKey: 'parking-lot',
  },
  wander: {
    emoji: '💭',
    text: 'mind-wandering has shown up most often lately — want to try one tiny intention, then re-read it after a drift?',
    evidenceKey: 'if-then',
  },
  restless: {
    emoji: '🐇',
    text: 'restlessness has shown up most often lately — a moving break could be worth trying before sitting back down.',
    evidenceKey: 'breaks-are-fuel',
  },
};

const pctOf = (n: number, total: number) => Math.round((n / Math.max(1, total)) * 100);

/** "4 weeks" for the default window; falls back to days for odd windows. */
const windowLabel = (days: number) =>
  days % 7 === 0 ? `${days / 7} weeks` : `${days} days`;

/**
 * Build the personal attention recipe from the event log. Returns [] until
 * there are at least RECIPE_MIN_SIGNALS signals in the window; callers show a
 * "still learning you" line instead. Capped at 4 rows so it stays a recipe,
 * not a lecture.
 *
 * PLAN 2.4: every row carries `{ because, evidenceKey }` — the because cites
 * the user's own numbers from this window, the evidenceKey names the science
 * behind the suggestion. No recommendation without a because: adaptation must
 * stay transparent and explainable (docs/science.md#measurement — JITAI row).
 */
export function computeAttentionPlan(
  events: CompanionEvent[],
  focusLenMins: number,
  now = Date.now(),
  windowDays = 28,
  context: AttentionPlanContext = {
    chronotype: 'notSure',
    completionByStartHour: [],
  },
): RecipeItem[] {
  const window = companionEventsForAnalytics(events, now).filter(
    (e) => now - companionEventOccurredAt(e) <= windowDays * 86400000,
  );
  const drifts = window.filter(isDriftEvent);
  const classifiedDrifts = drifts.filter(isClassifiedDriftEvent);
  const focused = window.filter((e) => e.kind === 'focused');
  const aways = window.filter((e) => e.kind === 'away');
  if (focused.length + drifts.length + aways.length < RECIPE_MIN_SIGNALS) return [];

  const items: RecipeItem[] = [];
  const answers = focused.length + drifts.length;
  const driftRate = answers > 0 ? drifts.length / answers : 0;
  const span = windowLabel(windowDays);

  // 1) Session length, fit to where attention actually bends.
  if (drifts.length >= 3) {
    const late = drifts.filter((d) => phaseOf(driftOnsetMin(d), d.len) === 'late');
    const early = drifts.filter((d) => phaseOf(driftOnsetMin(d), d.len) === 'early');
    if (late.length > drifts.length / 2 && focusLenMins >= 20) {
      const shorter = Math.max(15, focusLenMins - 5);
      items.push({
        emoji: '⏱️',
        text: `your focus tends to fade near the end — want to try ${shorter}-minute sessions for a week and compare the endings?`,
        because: `${late.length} of your ${drifts.length} drifts these last ${span} started in the final stretch of a session.`,
        evidenceKey: 'attention-fades',
      });
    } else if (early.length > drifts.length / 2) {
      items.push({
        emoji: '🚀',
        text: 'drifts cluster right after you start — a 30-second warm-up may help you land in the session.',
        because: `${early.length} of your ${drifts.length} drifts these last ${span} came in the opening minutes.`,
        evidenceKey: 'desk-help',
      });
    }
  } else if (answers >= 8 && driftRate < 0.15 && focusLenMins <= 30) {
    items.push({
      emoji: '📈',
      text: `your recent check-ins were mostly focused — if you want an experiment, try ${focusLenMins + 5}-minute sessions and see how they feel.`,
      because: `you answered focused on ${focused.length} of ${answers} check-ins (${pctOf(focused.length, answers)}%) these last ${span}.`,
      evidenceKey: 'breaks-are-fuel',
    });
  }

  // 2) The clock: blend the self-tag as a light prior with observed session
  // completion by start hour. Three sessions are still required in a bucket,
  // and the because-sentence always names both inputs (PLAN 4.4).
  const completionBuckets = new Map<TimeBucket, { completed: number; total: number }>();
  for (const hour of context.completionByStartHour) {
    const name = timeBucketForHour(hour.hour);
    const bucket = completionBuckets.get(name) ?? { completed: 0, total: 0 };
    bucket.completed += hour.completed;
    bucket.total += hour.total;
    completionBuckets.set(name, bucket);
  }
  let best: { name: TimeBucket; score: number; completed: number; total: number } | null = null;
  let worst: { name: TimeBucket; score: number; completed: number; total: number } | null = null;
  for (const [name, bucket] of completionBuckets) {
    if (bucket.total < 3) continue;
    const score =
      (bucket.completed + chronotypePrior(context.chronotype, name) * 2) /
      (bucket.total + 2);
    const candidate = { name, score, completed: bucket.completed, total: bucket.total };
    if (!best || score > best.score) best = candidate;
    if (!worst || score < worst.score) worst = candidate;
  }
  const tagLabel = CHRONOTYPE_LABEL[context.chronotype];
  if (best && best.score >= 0.6) {
    items.push({
      emoji: '🌤️',
      text: `${best.name} have worked well for your recent sessions — perhaps try the task that asks the most of you then.`,
      because: `you chose “${tagLabel}”, and ${best.completed} of your ${best.total} sessions started in the ${TIME_BUCKET_PHRASE[best.name]} were completed (${pctOf(best.completed, best.total)}%); the tag is a gentle first guess, blended with what you’ve finished.`,
      evidenceKey: 'golden-hours',
    });
  }
  if (worst && best && worst.name !== best.name && worst.score <= 0.45) {
    items.push({
      emoji: '🌙',
      text: `fewer recent ${worst.name} sessions have finished — a lighter task could be worth trying then.`,
      because: `you chose “${tagLabel}”, and ${worst.completed} of your ${worst.total} sessions started in the ${TIME_BUCKET_PHRASE[worst.name]} were completed (${pctOf(worst.completed, worst.total)}%); your recent sessions have the louder voice as the log grows.`,
      evidenceKey: 'golden-hours',
    });
  }

  // 3) Their dominant drift style, met with a matching strategy.
  if (classifiedDrifts.length >= 3) {
    const counts = new Map<DriftKind, number>();
    for (const d of classifiedDrifts) counts.set(d.kind, (counts.get(d.kind) ?? 0) + 1);
    const [dominant, domCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    // Where the dominant kind clusters, if it clearly does — makes the
    // because read like "62% rabbit-holes, mostly mid-session".
    const byPhase = { early: 0, mid: 0, late: 0 };
    const dom = classifiedDrifts.filter((d) => d.kind === dominant);
    for (const d of dom) byPhase[phaseOf(driftOnsetMin(d), d.len)]++;
    const topPhase = (Object.entries(byPhase) as [Phase, number][]).sort((a, b) => b[1] - a[1])[0];
    const phaseNote =
      topPhase[1] > dom.length / 2
        ? `, mostly ${{ early: 'early on', mid: 'mid-session', late: 'late in sessions' }[topPhase[0]]}`
        : '';
    items.push({
      ...RECIPE_STRATEGY[dominant],
      because: `${pctOf(domCount, classifiedDrifts.length)}% of your classified drifts these last ${span} were ${KIND_NAMES[dominant]}${phaseNote}.`,
    });
  }

  // 4) Quiet tab-aways: the drift that never gets asked about.
  if (aways.length >= 3 && aways.length >= answers * 0.5) {
    items.push({
      emoji: '🖥️',
      text: 'the tab pulls you away a lot — try fullscreen or a separate desktop for sessions so elsewhere is a real trip, not one flick.',
      because: `${aways.length} quiet tab-away${aways.length === 1 ? '' : 's'} next to ${answers} answered check-in${answers === 1 ? '' : 's'} these last ${span}.`,
      evidenceKey: 'desk-help',
    });
  }

  return items.slice(0, 4);
}
