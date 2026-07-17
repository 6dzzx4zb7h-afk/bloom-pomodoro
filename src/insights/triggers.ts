/**
 * Low-frequency, explainable feature triggers (PLAN 3.5).
 *
 * WOOP is offered only after the strict trailing-abandon signal from
 * abandonStreakInfo(). A completed or interrupted session breaks that signal.
 * We also require a new abandon since the last offer and keep a seven-day
 * cooldown, so an unanswered or dismissed card never turns into nagging
 * (docs/science.md#do-not-build — no always-on nudging).
 */

import type { SessionRecord } from '../store/sessions';
import type { CompanionEvent } from '../store/companion';
import { isDriftEvent } from '../store/companion';
import { dayKeyFor } from '../store/dayKey';
import {
  abandonStreakInfo,
  hasEnoughSignal,
  medianMinutesToFirstDrift,
} from '../store/sessionStats';

export const WOOP_ABANDON_THRESHOLD = 3;
export const WOOP_COOLDOWN_DAYS = 7;
export const WOOP_COOLDOWN_MS = WOOP_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

export function shouldOfferWoop(
  records: SessionRecord[],
  lastOfferedAt: number | null,
  now: number = Date.now(),
): boolean {
  const info = abandonStreakInfo(records);
  if (info.streak < WOOP_ABANDON_THRESHOLD || info.lastAbandonedAt == null) return false;
  if (lastOfferedAt == null) return true;

  // A future timestamp is treated as still cooling down (clock changes should
  // not make the prompt repeat). A stale streak is never re-offered unchanged.
  if (now - lastOfferedAt < WOOP_COOLDOWN_MS) return false;
  return info.lastAbandonedAt > lastOfferedAt;
}

/* ------------------------------------------------------------------ *
 * Pre-slump gentle check (PLAN 4.5)
 * ------------------------------------------------------------------ */

/** The persisted counters that make the nudge caps survive a reload. */
export interface PreSlumpCaps {
  day: string | null;
  count: number;
  silenced: boolean;
  lastSessionId: string | null;
}

export const EMPTY_PRE_SLUMP_CAPS: PreSlumpCaps = {
  day: null,
  count: 0,
  silenced: false,
  lastSessionId: null,
};

export const PRE_SLUMP_DAILY_CAP = 2;
export const PRE_SLUMP_LEAD_MIN = 2;

/** Local calendar day: caps follow the user's day, not UTC. */
export function localDayKey(now: number): string {
  return dayKeyFor(now);
}

export interface PreSlumpSuggestion {
  /** Typical first drift from this user's linked focus-session history. */
  typicalFirstDriftMin: number;
  /** The point shortly before that median when the cue may appear. */
  cueMin: number;
  /** Number of separate focus sessions contributing a drift signal. */
  signalSessions: number;
}

interface PreSlumpTriggerInput {
  optedIn: boolean;
  sessionId: string | null;
  elapsedMin: number;
  records: SessionRecord[];
  events: CompanionEvent[];
  caps: PreSlumpCaps;
  now?: number;
}

/**
 * Return one transparent, data-backed cue or null.
 *
 * The rule is deliberately conservative: five separate focus sessions must
 * contain a linked drift, the cue only exists in the short window before the
 * typical first drift, and persisted session/day guards prevent repeats.
 */
export function preSlumpSuggestion({
  optedIn,
  sessionId,
  elapsedMin,
  records,
  events,
  caps,
  now = Date.now(),
}: PreSlumpTriggerInput): PreSlumpSuggestion | null {
  if (!optedIn || !sessionId || !Number.isFinite(elapsedMin)) return null;

  const today = localDayKey(now);
  const countToday = caps.day === today ? caps.count : 0;
  const silencedToday = caps.day === today && caps.silenced;
  if (
    silencedToday ||
    countToday >= PRE_SLUMP_DAILY_CAP ||
    caps.lastSessionId === sessionId
  ) {
    return null;
  }

  // A focus cue should learn only from comparable focus countdowns, not a
  // tiny start or an open-ended flow stopwatch.
  const focusRecords = records.filter((record) => record.mode === 'focus');
  const focusSessionIds = new Set(focusRecords.map((record) => record.id));
  const linkedEventToSession = new Map<string, string>();
  for (const record of focusRecords) {
    for (const eventId of record.driftEventIds) linkedEventToSession.set(eventId, record.id);
  }

  const signalSessionIds = new Set<string>();
  for (const event of events) {
    if (!isDriftEvent(event)) continue;
    const linkedSessionId =
      event.sessionId ?? (event.id ? linkedEventToSession.get(event.id) : undefined);
    if (linkedSessionId && focusSessionIds.has(linkedSessionId)) {
      signalSessionIds.add(linkedSessionId);
    }
  }
  if (!hasEnoughSignal(signalSessionIds.size)) return null;

  const typicalFirstDriftMin = medianMinutesToFirstDrift(focusRecords, events);
  // If drifting usually begins in the first minute, there is no honest
  // "shortly before" moment to use, so Bloom stays quiet.
  if (typicalFirstDriftMin == null || typicalFirstDriftMin <= 1) return null;

  const cueMin = Math.max(0.5, typicalFirstDriftMin - PRE_SLUMP_LEAD_MIN);
  if (elapsedMin < cueMin || elapsedMin >= typicalFirstDriftMin) return null;

  return {
    typicalFirstDriftMin,
    cueMin,
    signalSessions: signalSessionIds.size,
  };
}
