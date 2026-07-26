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
import { dayKeyFor } from './dayKey';
import {
  type CompanionEvent,
  type Phase,
  RECIPE_MIN_SIGNALS,
  companionEventsForAnalytics,
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

export interface StudyDayGroup {
  /** Resolved local study-day key, newest groups sort first. */
  day: string;
  records: SessionRecord[];
}

/**
 * Timestamp gate shared by every session-derived claim. A malformed interval
 * or a record that has not ended yet is quarantined from analytics without
 * rewriting the durable log (PLAN 8.19).
 */
export function sessionRecordsForAnalytics(
  records: SessionRecord[],
  now = Date.now(),
): SessionRecord[] {
  if (!Number.isFinite(now) || now < 0) return [];
  return records.filter(
    (record) =>
      Number.isFinite(record.startedAt) &&
      Number.isFinite(record.endedAt) &&
      record.startedAt >= 0 &&
      record.startedAt <= record.endedAt &&
      record.endedAt <= now,
  );
}

/**
 * Group immutable raw records by the user's study-day boundary.
 *
 * PLAN 9.2 keeps this pure so History (9.3) can render the same grouping as
 * streaks and weekly review without storing or rewriting a derived day on a
 * record. Changing the boundary therefore re-groups the same objects.
 */
export function groupSessionsByStudyDay(
  records: SessionRecord[],
  dayStartHour = 0,
  now = Date.now(),
): StudyDayGroup[] {
  const byDay = new Map<string, SessionRecord[]>();
  for (const record of sessionRecordsForAnalytics(records, now)) {
    const day = dayKeyFor(record.endedAt, dayStartHour);
    const group = byDay.get(day);
    if (group) group.push(record);
    else byDay.set(day, [record]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, grouped]) => ({
      day,
      records: [...grouped].sort(
        (a, b) => a.endedAt - b.endedAt || a.id.localeCompare(b.id),
      ),
    }));
}

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
  now = Date.now(),
): (CompletionBucket & { plannedMin: number })[] {
  const byLen = new Map<number, CompletionBucket>();
  for (const r of sessionRecordsForAnalytics(records, now)) {
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
  now = Date.now(),
): (CompletionBucket & { hour: number })[] {
  const byHour = new Map<number, CompletionBucket>();
  for (const r of sessionRecordsForAnalytics(records, now)) {
    const b = byHour.get(r.startHour) ?? bucket();
    tally(b, r);
    byHour.set(r.startHour, b);
  }
  return [...byHour.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, b]) => ({ hour, ...b }));
}

/**
 * Normalize linked events against the session interval that owns them.
 * Modern events use `shownAt` for their minute/phase; `ts` is only the later
 * answer time. Legacy events without `shownAt` retain their recorded minute.
 */
export function eventsForSessionAnalytics(
  record: SessionRecord,
  events: CompanionEvent[],
  now = Date.now(),
): CompanionEvent[] {
  const linkedIds = new Set(record.driftEventIds);
  const rawById = new Map(
    events
      .filter((event): event is CompanionEvent & { id: string } => event.id != null)
      .map((event) => [event.id, event]),
  );
  const linked = companionEventsForAnalytics(events, now).filter(
    (event) =>
      event.sessionId === record.id ||
      (event.id != null && linkedIds.has(event.id)),
  );
  let lastFocusedMin = 0;
  const normalized: CompanionEvent[] = [];
  for (const event of linked) {
    let min = event.min;
    if (event.shownAt !== undefined) {
      if (event.shownAt < record.startedAt || event.shownAt > record.endedAt) continue;
      min = (event.shownAt - record.startedAt) / 60_000;
    }
    min = Math.min(event.len, Math.max(0, min));
    const original = event.id ? rawById.get(event.id) : undefined;
    const next: CompanionEvent = {
      ...event,
      min,
      ...(isDriftEvent(event) &&
      (original?.estOnsetMin !== undefined || event.estOnsetMin !== undefined || lastFocusedMin > 0)
        ? {
            estOnsetMin: driftOnsetMin(
              {
                ...event,
                min,
                estOnsetMin: original?.estOnsetMin ?? event.estOnsetMin,
              },
              lastFocusedMin,
            ),
          }
        : {}),
    };
    if (event.kind === 'focused') {
      lastFocusedMin = Math.max(lastFocusedMin, min);
    }
    normalized.push(next);
  }
  return normalized;
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
  now: number,
): CompanionEvent[] {
  const validRecords = sessionRecordsForAnalytics(records, now);
  return validRecords.flatMap((record) =>
    eventsForSessionAnalytics(record, events, now).filter(isDriftEvent),
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
  now = Date.now(),
): Record<Phase, number> {
  // Prefer the user's own onset estimate over the detection minute (PLAN 1.5).
  const dist: Record<Phase, number> = { early: 0, mid: 0, late: 0 };
  for (const e of driftsForSessions(records, events, now)) {
    dist[phaseOf(driftOnsetMin(e), e.len)]++;
  }
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
  now = Date.now(),
): number | null {
  const validRecords = sessionRecordsForAnalytics(records, now);
  const drifts = driftsForSessions(validRecords, events, now);
  if (drifts.length === 0) return null;

  const firstBySession = new Map<string, number>();
  const linkedIdToSession = new Map<string, string>();
  for (const r of validRecords) {
    for (const id of r.driftEventIds) linkedIdToSession.set(id, r.id);
  }
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
