/**
 * Gentle streak (PLAN 5.4).
 *
 * The streak counts days with at least one finished work session, framed as
 * consistency over months (science.md §measurement — Lally et al. 2010:
 * automaticity takes a median 66 days, range 18–254). Two softeners keep it
 * a mirror rather than a chain to guard (science.md §do-not-build):
 *
 * - One free rest day per week: a single quiet day between two active days
 *   is covered automatically and the count keeps growing.
 * - Longer gaps pause the count instead of "losing" anything; the app greets
 *   the return warmly (the `comeBack` flag) and the next finished session
 *   simply starts the count growing again.
 */

export interface StreakData {
  /** Consecutive active days (rest-day bridges included). */
  streak: number;
  /** YYYY-MM-DD of the last day a work session finished. */
  lastFocusDay: string | null;
  /** YYYY-MM-DD of the missed day the weekly free rest day last covered. */
  restDayUsedOn: string | null;
}

/** Days between the two rest days one streak may lean on. */
export const REST_DAY_INTERVAL_DAYS = 7;

/** Whole days from `a` to `b` (YYYY-MM-DD keys). Noon-anchored to dodge DST. */
export function daysBetween(a: string, b: string): number {
  const ms = new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime();
  return Math.round(ms / 86400000);
}

/** The weekly free rest day is available again once the last one is 7+ days old. */
export function restDayAvailable(restDayUsedOn: string | null, missedDay: string): boolean {
  return restDayUsedOn === null || daysBetween(restDayUsedOn, missedDay) >= REST_DAY_INTERVAL_DAYS;
}

/**
 * Whether the streak is still growing as of `today`: the last active day is
 * today or yesterday, or exactly one day was missed and the weekly free rest
 * day can cover it.
 */
export function streakAlive(data: StreakData, today: string): boolean {
  if (data.streak <= 0 || data.lastFocusDay === null) return false;
  const gap = daysBetween(data.lastFocusDay, today);
  if (gap <= 1) return true;
  if (gap === 2) {
    const missedDay = dayBefore(today);
    return restDayAvailable(data.restDayUsedOn, missedDay);
  }
  return false;
}

/** YYYY-MM-DD of the day before a YYYY-MM-DD key. */
function dayBefore(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Count today's first finished work session into the streak. A one-day gap
 * consumes the weekly free rest day and keeps growing; anything longer starts
 * a fresh count at 1 — the old total is simply in the past, never "lost".
 */
export function bumpStreakGentle(data: StreakData, today: string): StreakData {
  const { lastFocusDay, restDayUsedOn } = data;
  if (lastFocusDay === null) {
    return { streak: 1, lastFocusDay: today, restDayUsedOn };
  }
  const gap = daysBetween(lastFocusDay, today);
  if (gap <= 0) {
    // Already counted today (or the clock moved backwards — stay calm).
    return { ...data, lastFocusDay: today };
  }
  if (gap === 1) {
    return { streak: data.streak + 1, lastFocusDay: today, restDayUsedOn };
  }
  if (gap === 2) {
    const missedDay = dayBefore(today);
    if (restDayAvailable(restDayUsedOn, missedDay)) {
      return { streak: data.streak + 1, lastFocusDay: today, restDayUsedOn: missedDay };
    }
  }
  return { streak: 1, lastFocusDay: today, restDayUsedOn };
}
