/**
 * One shared timestamp → local calendar-day key ("YYYY-MM-DD").
 *
 * Extracted July 2026 as the consolidation half of PLAN 9.2: dayStr
 * (useBloom), localDayKey (insights/triggers), todayStr (goals) and the
 * weekly-review week key all render a local day, and they have to agree with
 * each other before a configurable day boundary can exist. `dayStartHour` is
 * that future boundary (a 1 a.m. finish belongs to the evening's day for a
 * night owl); every current caller passes the default 0, so behavior is
 * unchanged until PLAN 9.2's remaining half wires the setting through.
 * Key-to-key arithmetic (streak.ts daysBetween/dayBefore) stays where it is —
 * it never touches a timestamp. No React, no storage.
 */
export const DAY_START_HOUR_MIN = 0;
export const DAY_START_HOUR_MAX = 23;

/** Persisted/user-entered boundaries are always a whole local-clock hour. */
export function normalizeDayStartHour(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DAY_START_HOUR_MIN;
  return Math.max(
    DAY_START_HOUR_MIN,
    Math.min(DAY_START_HOUR_MAX, Math.round(raw)),
  );
}

export function dayKeyFor(ts: number, dayStartHour = 0): string {
  const boundary = normalizeDayStartHour(dayStartHour);
  const d = new Date(ts);
  if (d.getHours() < boundary) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * Epoch timestamp of the next local study-day boundary.
 *
 * Calendar setters are intentional: adding 24 hours would fire an hour early
 * or late when the local clock crosses daylight-saving time. PLAN 8.23 uses
 * this for the store-owned live UI refresh; PLAN 9.2 can pass its persisted
 * boundary.
 */
export function nextDayBoundaryAt(now: number, dayStartHour = 0): number {
  const boundary = normalizeDayStartHour(dayStartHour);
  const next = new Date(now);
  next.setHours(boundary, 0, 0, 0);
  if (next.getTime() <= now) next.setDate(next.getDate() + 1);
  return next.getTime();
}
