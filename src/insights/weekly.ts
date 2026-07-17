/**
 * Weekly review engine (PLAN 2.3).
 *
 * A once-per-week look back that answers exactly two questions from the
 * user's own data — "what helped you start?" and "what helped you recover?" —
 * plus one suggested experiment for next week. Nothing else: the review
 * deliberately skips judgment and totals-for-their-own-sake
 * (docs/science.md#measurement — the tracking article brief: review with only
 * those two questions; feedback stays simple and low-frequency, Krukowski 2024).
 *
 * Pure functions only: records + events + a `now` in, strings out. The card
 * (WeeklyReview.tsx) renders whatever comes back; FocusScreen and useBloom
 * own the once-per-calendar-week gate via `weekKey()`.
 */

import type { SessionRecord } from '../store/sessions';
import { dayKeyFor } from '../store/dayKey';
import { type CompanionEvent, driftOnsetMin, phaseOf } from '../store/companion';
import { completionRateByStartHour } from '../store/sessionStats';
import { driftsForRecord } from './why';

/** Sessions needed in the window before the review answers its questions. */
export const WEEKLY_MIN_SESSIONS = 5;

/** How far back the review looks. */
export const WEEKLY_WINDOW_DAYS = 7;

export type WeeklyReviewResult =
  | {
      kind: 'ready';
      sessionCount: number;
      /** Answer to "what helped you start?" */
      start: string;
      /** Answer to "what helped you recover?" */
      recover: string;
      /** One suggested experiment for next week. */
      experiment: string;
    }
  | {
      kind: 'learning';
      sessionCount: number;
      text: string;
    };

/**
 * Local Monday-of-this-week as YYYY-MM-DD — the "shown this calendar week
 * already?" key persisted in useBloom. Monday-based so a weekend review and
 * the following Monday's don't collide into one week.
 */
export function weekKey(now: number = Date.now()): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
  return dayKeyFor(d.getTime());
}

/* Thresholds — small and legible, same spirit as why.ts. */

/** Samples an hour bucket needs before it can be called a strong hour. */
const GOLDEN_MIN_SAMPLES = 3;
/** Completion rate an hour bucket needs to count as a strong hour. */
const GOLDEN_MIN_RATE = 0.7;
/** Planned length at or under this reads as a deliberately small session. */
const SHORT_SESSION_MAX_MIN = 15;
/** Short sessions needed before "small blocks helped" is a claim. */
const SHORT_MIN_SAMPLES = 2;
const SHORT_MIN_RATE = 0.6;
/** Drifts needed before an early/late pattern earns the experiment slot. */
const PATTERN_MIN_DRIFTS = 3;

function fmtHour(h: number): string {
  if (h === 0) return 'midnight';
  if (h === 12) return 'noon';
  return h < 12 ? `${h} am` : `${h - 12} pm`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

interface WeekSignals {
  records: SessionRecord[];
  /** Drifts per session id, only for sessions in the window. */
  driftsBySession: Map<string, CompanionEvent[]>;
  goldenHour: { hour: number; completed: number; total: number } | null;
}

function collectSignals(records: SessionRecord[], events: CompanionEvent[]): WeekSignals {
  const driftsBySession = new Map<string, CompanionEvent[]>();
  for (const r of records) driftsBySession.set(r.id, driftsForRecord(r, events));

  // Strongest qualifying start hour, if any (ties: earliest hour wins, which
  // completionRateByStartHour's ascending order gives us for free).
  let goldenHour: WeekSignals['goldenHour'] = null;
  for (const b of completionRateByStartHour(records)) {
    if (b.total >= GOLDEN_MIN_SAMPLES && b.rate >= GOLDEN_MIN_RATE) {
      if (!goldenHour || b.rate > goldenHour.completed / goldenHour.total) {
        goldenHour = { hour: b.hour, completed: b.completed, total: b.total };
      }
    }
  }
  return { records, driftsBySession, goldenHour };
}

/** Answer 1 — "what helped you start?" First matching observation wins. */
function whatHelpedStart(sig: WeekSignals): string {
  if (sig.goldenHour) {
    const { hour, completed, total } = sig.goldenHour;
    return `starting around ${fmtHour(hour)} worked — ${completed} of ${total} sessions there bloomed.`;
  }
  const short = sig.records.filter(
    (r) => r.mode === 'tiny' || (r.plannedMin != null && r.plannedMin <= SHORT_SESSION_MAX_MIN),
  );
  const shortDone = short.filter((r) => r.outcome === 'completed');
  if (short.length >= SHORT_MIN_SAMPLES && shortDone.length / short.length >= SHORT_MIN_RATE) {
    return `small blocks — ${shortDone.length} of ${plural(short.length, 'short session')} finished.`;
  }
  return `you pressed start ${sig.records.length} times — starting is the heavy part, and you kept doing it.`;
}

/** Answer 2 — "what helped you recover?" */
function whatHelpedRecover(sig: WeekSignals): string {
  let driftedSessions = 0;
  let recovered = 0;
  for (const r of sig.records) {
    if ((sig.driftsBySession.get(r.id)?.length ?? 0) === 0) continue;
    driftedSessions++;
    if (r.outcome === 'completed') recovered++;
  }
  if (recovered > 0) {
    return `you wandered and came back — ${plural(recovered, 'session')} drifted and still finished.`;
  }
  if (driftedSessions === 0) {
    return 'no drifts logged this week, so nothing needed recovering.';
  }
  // Drifts happened and those sessions ended early: restart framing, never a
  // grade (docs/voice.md pair #1).
  return 'some drifts ended sessions early — that happened. the way back in stays open.';
}

/** The one experiment for next week. First matching pattern wins. */
function experimentFor(sig: WeekSignals): string {
  const drifts = [...sig.driftsBySession.values()].flat();
  if (drifts.length >= PATTERN_MIN_DRIFTS) {
    const phases = drifts.map((d) => phaseOf(driftOnsetMin(d), d.len));
    if (phases.filter((p) => p === 'late').length > drifts.length / 2) {
      return 'worth a try: a 5-minute-shorter focus block next week — compare how the endings feel.';
    }
    if (phases.filter((p) => p === 'early').length > drifts.length / 2) {
      return 'worth a try: a 30-second warm-up before pressing start — water, one intention, go.';
    }
  }
  if (sig.goldenHour) {
    return `worth a try: give your ${fmtHour(sig.goldenHour.hour)} starts the heaviest task next week.`;
  }
  return 'worth a try: one tiny 2-minute session on a slow day, just to see.';
}

/**
 * The whole review. Sessions are windowed by when they ended; drift events
 * ride along via their session links (1.3), so no separate event windowing.
 */
export function computeWeeklyReview(
  records: SessionRecord[],
  events: CompanionEvent[],
  now: number = Date.now(),
  windowDays: number = WEEKLY_WINDOW_DAYS,
): WeeklyReviewResult {
  const cutoff = now - windowDays * 86400000;
  const week = records.filter((r) => r.endedAt >= cutoff && r.endedAt <= now);

  if (week.length < WEEKLY_MIN_SESSIONS) {
    return {
      kind: 'learning',
      sessionCount: week.length,
      text:
        week.length === 0
          ? 'a quiet week on the timer — the review fills in as sessions happen.'
          : `${plural(week.length, 'session')} this week — still learning your patterns. the review gets richer as we go.`,
    };
  }

  const sig = collectSignals(week, events);
  return {
    kind: 'ready',
    sessionCount: week.length,
    start: whatHelpedStart(sig),
    recover: whatHelpedRecover(sig),
    experiment: experimentFor(sig),
  };
}
