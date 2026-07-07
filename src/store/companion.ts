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
  /** Epoch ms. */
  ts: number;
  /** Minute into the focus session when it happened. */
  min: number;
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

export function appendEvent(e: CompanionEvent) {
  const cutoff = e.ts - MAX_AGE_DAYS * 86400000;
  const events = [...loadEvents().filter((x) => x.ts >= cutoff), e].slice(-MAX_EVENTS);
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify({ version: 1, events }));
  } catch {
    /* storage unavailable — companion runs without memory */
  }
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
    for (const d of drifts) byPhase[phaseOf(d.min, d.len)]++;
    const top = (Object.entries(byPhase) as [Phase, number][]).sort((a, b) => b[1] - a[1])[0];
    if (top[1] > drifts.length / 2) phase = top[0];
  }

  // Best time of day by focused ratio, only for buckets with real samples.
  let bestTime: string | null = null;
  const buckets = new Map<string, { f: number; d: number }>();
  for (const e of [...focused, ...drifts]) {
    const b = buckets.get(timeBucket(e.ts)) ?? { f: 0, d: 0 };
    if (e.kind === 'focused') b.f++;
    else b.d++;
    buckets.set(timeBucket(e.ts), b);
  }
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
