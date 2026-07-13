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
import { abandonStreakInfo } from '../store/sessionStats';

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
