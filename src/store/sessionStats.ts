/**
 * Pure stats selectors over the session log (PLAN 1.4).
 *
 * A small set of well-tested aggregates, not a metrics zoo
 * (docs/science.md#measurement: keep feedback simple and low-frequency —
 * Krukowski et al. 2024). No React, no storage, no clock reads: every
 * function takes its inputs explicitly so it can be unit-tested with
 * synthetic fixtures and reused by debriefs (2.1), the why-engine (2.2),
 * weekly reviews (2.3) and cadence suggestions (4.x).
 *
 * Drift timing lives in the companion event log, linked to sessions in 1.3;
 * selectors that need it take both the records and the events.
 */

import type { SessionRecord } from './sessions';
import {
  type CompanionEvent,
  type Phase,
  RECIPE_MIN_SIGNALS,
  driftOnsetMin,
  isDriftEvent,
  phaseOf,
} from './companion';

/** One completion-rate bucket. `rate` is completed / total, in [0, 1]. */
export interface CompletionBucket {
  total: number;
  completed: number;
  rate: number;
}

/**
 * Same low-data guard as computeAttentionPlan(): stats mean nothing until a
 * handful of signals exist. Callers show a "still learning you" state below
 * the threshold instead of confidently-wrong numbers.
 */
export const STATS_MIN_SIGNAL = RECIPE_MIN_SIGNALS;

export function hasEnoughSignal(n: number, min: number = STATS_MIN_SIGNAL): boolean {
  return n >= min;
}

function bucket(): CompletionBucket {
  return { total: 0, completed: 0, rate: 0 };
}

function tally(b: CompletionBucket, r: SessionRecord) {
  b.total++;
  if (r.outcome === 'completed') b.completed++;
  b.rate = b.completed / b.total;
}

/**
 * Completion rate per planned session length, ascending by length. Flow
 * sessions have no plan (plannedMin null) and are excluded — a stopwatch
 * can't be "completed against plan".
 */
export function completionRateByPlannedLength(
  records: SessionRecord[],
): (CompletionBucket & { plannedMin: number })[] {
  const byLen = new Map<number, CompletionBucket>();
  for (const r of records) {
    if (r.plannedMin == null) continue;
    const b = byLen.get(r.plannedMin) ?? bucket();
    tally(b, r);
    byLen.set(r.plannedMin, b);
  }
  return [...byLen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([plannedMin, b]) => ({ plannedMin, ...b }));
}

/**
 * Completion rate per local start hour (0–23), ascending by hour; only hours
 * with at least one session appear. All modes count — finishing what you
 * started is meaningful for flow and tiny sessions too.
 */
export function completionRateByStartHour(
  records: SessionRecord[],
): (CompletionBucket & { hour: number })[] {
  const byHour = new Map<number, CompletionBucket>();
  for (const r of records) {
    const b = byHour.get(r.startHour) ?? bucket();
    tally(b, r);
    byHour.set(r.startHour, b);
  }
  return [...byHour.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, b]) => ({ hour, ...b }));
}

/**
 * The drift events that belong to the given sessions. An event matches by
 * its stamped sessionId or by appearing in a record's driftEventIds — either
 * link (both written in 1.3) is enough; pre-1.3 events match neither and are
 * simply not attributed.
 */
function driftsForSessions(
  records: SessionRecord[],
  events: CompanionEvent[],
): CompanionEvent[] {
  const sessionIds = new Set(records.map((r) => r.id));
  const linkedIds = new Set(records.flatMap((r) => r.driftEventIds));
  return events.filter(
    (e) =>
      isDriftEvent(e) &&
      ((e.sessionId != null && sessionIds.has(e.sessionId)) ||
        (e.id != null && linkedIds.has(e.id))),
  );
}

/**
 * Where in their sessions this person's drifts happen — early / mid / late
 * counts (docs/science.md#staying: mind-wandering increases with time on
 * task; *when* it shows up is the useful signal — Zanesco et al. 2024).
 */
export function driftPhaseDistribution(
  records: SessionRecord[],
  events: CompanionEvent[],
): Record<Phase, number> {
  // Prefer the user's own onset estimate over the detection minute (PLAN 1.5).
  const dist: Record<Phase, number> = { early: 0, mid: 0, late: 0 };
  for (const e of driftsForSessions(records, events)) dist[phaseOf(driftOnsetMin(e), e.len)]++;
  return dist;
}

/**
 * Median minute-into-session of each session's *first* drift, across sessions
 * that had at least one. Null when no session has an attributed drift. This
 * is the number cadence suggestions (4.1/4.6) fit session length to.
 */
export function medianMinutesToFirstDrift(
  records: SessionRecord[],
  events: CompanionEvent[],
): number | null {
  const drifts = driftsForSessions(records, events);
  if (drifts.length === 0) return null;

  const firstBySession = new Map<string, number>();
  const linkedIdToSession = new Map<string, string>();
  for (const r of records) for (const id of r.driftEventIds) linkedIdToSession.set(id, r.id);
  for (const e of drifts) {
    const sid = e.sessionId ?? (e.id != null ? linkedIdToSession.get(e.id) : undefined);
    if (sid == null) continue;
    // Prefer the user's own onset estimate over the detection minute (PLAN 1.5).
    const min = driftOnsetMin(e);
    const prev = firstBySession.get(sid);
    if (prev === undefined || min < prev) firstBySession.set(sid, min);
  }
  const firsts = [...firstBySession.values()].sort((a, b) => a - b);
  if (firsts.length === 0) return null;
  const mid = Math.floor(firsts.length / 2);
  return firsts.length % 2 === 1 ? firsts[mid] : (firsts[mid - 1] + firsts[mid]) / 2;
}

export interface AbandonStreakInfo {
  /** Consecutive 'abandoned' outcomes at the tail of the log. */
  streak: number;
  /** endedAt of the most recent abandoned session in the streak, if any. */
  lastAbandonedAt: number | null;
}

/**
 * Trailing run of abandoned sessions — the trigger signal for the optional
 * WOOP offer (3.5). Deliberately strict: only 'abandoned' counts, and an
 * 'interrupted' session (app closed, not a choice) breaks the run, so the
 * offer never fires off ambiguous data.
 */
export function abandonStreakInfo(records: SessionRecord[]): AbandonStreakInfo {
  let streak = 0;
  let lastAbandonedAt: number | null = null;
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].outcome !== 'abandoned') break;
    streak++;
    if (lastAbandonedAt === null) lastAbandonedAt = records[i].endedAt;
  }
  return { streak, lastAbandonedAt };
}
