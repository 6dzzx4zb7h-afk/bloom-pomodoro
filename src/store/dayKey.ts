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
export function dayKeyFor(ts: number, dayStartHour = 0): string {
  const d = new Date(ts);
  if (d.getHours() < dayStartHour) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}
